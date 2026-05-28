import {
  OrderRepository,
  StockRepository,
  WarehouseRepository,
  RouteRepository,
  FulfillmentPlanRepository,
  EventBus,
  FulfillmentOptimizationResult,
  Order,
  StockPosition,
  Warehouse,
  RouteEdge,
  Allocation,
  ShipmentRoute
} from '../contract/interfaces';

// ignora limite máximo de dias
// removed maxDeliveryDays validation
// 10. Ignores routes whose total deliveryDays exceeds order maxDeliveryDays

function round2(value: number): number {
  return Number(value.toFixed(2));
}

type DemandUnit = {
  productId: string;
  unitWeightKg: number;
};

type AllocationChoice = {
  productId: string;
  warehouseId: string;
  unitWeightKg: number;
};

type CandidatePlan = {
  choices: AllocationChoice[];
  fulfilledCount: number;
  totalCost: number;
  shipments: ShipmentRoute[];
};

export class GlobalFulfillmentOptimizerService {
  constructor(
    private orderRepository: OrderRepository,
    private stockRepository: StockRepository,
    private warehouseRepository: WarehouseRepository,
    private routeRepository: RouteRepository,
    private fulfillmentPlanRepository: FulfillmentPlanRepository,
    private eventBus: EventBus
  ) {}

  async execute(input: {
    orderId: string;
  }): Promise<FulfillmentOptimizationResult> {
    const order = await this.orderRepository.findById(input.orderId);

    if (!order || order.status !== 'PAID') {
      const result: FulfillmentOptimizationResult = {
        orderId: input.orderId,
        status: 'NOT_FULFILLED',
        allocations: [],
        shipments: [],
        unfulfilledItems: [],
        totalCost: 0
      };

      await this.fulfillmentPlanRepository.save(result);

      return result;
    }

    const productIds = Array.from(
      new Set(order.items.map(item => item.productId))
    );

    const stock = await this.stockRepository.getStock(productIds);
    const warehouses = await this.warehouseRepository.getWarehouses();
    const edges = await this.routeRepository.getEdges();

    const activeWarehouseIds = new Set(
      warehouses
        .filter(warehouse => warehouse.active)
        .map(warehouse => warehouse.id)
    );

    const validStock = stock.filter(
      item =>
        item.quantity > 0 &&
        activeWarehouseIds.has(item.warehouseId)
    );

    const demandUnits = this.expandDemand(order);

    const bestPlan = this.findBestPlan({
      order,
      demandUnits,
      stock: validStock,
      edges: edges.filter(edge => edge.active)
    });

    const allocations = this.compressAllocations(bestPlan.choices);

    const unfulfilledItems = order.items
      .map(item => {
        const fulfilledQuantity = allocations
          .filter(allocation => allocation.productId === item.productId)
          .reduce((sum, allocation) => sum + allocation.quantity, 0);

        return {
          productId: item.productId,
          requestedQuantity: item.quantity,
          fulfilledQuantity
        };
      })
      .filter(item => item.fulfilledQuantity < item.requestedQuantity);

    let status: FulfillmentOptimizationResult['status'];

    if (bestPlan.fulfilledCount === 0) {
      status = 'NOT_FULFILLED';
    } else if (unfulfilledItems.length > 0) {
      status = 'PARTIALLY_FULFILLED';
    } else {
      status = 'FULFILLED';
    }

    const result: FulfillmentOptimizationResult = {
      orderId: order.id,
      status,
      allocations,
      shipments: bestPlan.shipments,
      unfulfilledItems,
      totalCost: round2(bestPlan.totalCost)
    };

    await this.fulfillmentPlanRepository.save(result);

    if (status === 'FULFILLED') {
      await this.eventBus.publish('fulfillment.optimized', {
        orderId: order.id
      });
    }

    if (status === 'PARTIALLY_FULFILLED') {
      await this.eventBus.publish('fulfillment.partial', {
        orderId: order.id
      });
    }

    return result;
  }

  private expandDemand(order: Order): DemandUnit[] {
    const units: DemandUnit[] = [];

    for (const item of order.items) {
      for (let i = 0; i < item.quantity; i++) {
        units.push({
          productId: item.productId,
          unitWeightKg: item.unitWeightKg
        });
      }
    }

    return units;
  }

  private findBestPlan(input: {
    order: Order;
    demandUnits: DemandUnit[];
    stock: StockPosition[];
    edges: RouteEdge[];
  }): CandidatePlan {
    let best: CandidatePlan = {
      choices: [],
      fulfilledCount: 0,
      totalCost: 0,
      shipments: []
    };

    const remainingStock = new Map<string, number>();

    for (const item of input.stock) {
      const key = `${item.productId}:${item.warehouseId}`;
      remainingStock.set(
        key,
        (remainingStock.get(key) ?? 0) + item.quantity
      );
    }

    const dfs = (
      index: number,
      choices: AllocationChoice[],
      stockState: Map<string, number>
    ) => {
      if (index === input.demandUnits.length) {
        const evaluated = this.evaluatePlan({
          order: input.order,
          choices,
          edges: input.edges
        });

        if (!evaluated) return;

        if (this.isBetterPlan(evaluated, best)) {
          best = evaluated;
        }

        return;
      }

      const unit = input.demandUnits[index];

      // Option 1: leave this unit unfulfilled.
      dfs(index + 1, choices, new Map(stockState));

      const possibleWarehouses = Array.from(stockState.keys())
        .filter(key => key.startsWith(`${unit.productId}:`))
        .map(key => {
          const [, warehouseId] = key.split(':');
          return warehouseId;
        })
        .sort();

      for (const warehouseId of possibleWarehouses) {
        const stockKey = `${unit.productId}:${warehouseId}`;
        const available = stockState.get(stockKey) ?? 0;

        if (available <= 0) {
          continue;
        }

        const nextStock = new Map(stockState);
        nextStock.set(stockKey, available - 1);

        dfs(
          index + 1,
          [
            ...choices,
            {
              productId: unit.productId,
              warehouseId,
              unitWeightKg: unit.unitWeightKg
            }
          ],
          nextStock
        );
      }
    };

    dfs(0, [], remainingStock);

    return best;
  }

  private evaluatePlan(input: {
    order: Order;
    choices: AllocationChoice[];
    edges: RouteEdge[];
  }): CandidatePlan | null {
    const weightByWarehouse = new Map<string, number>();

    for (const choice of input.choices) {
      weightByWarehouse.set(
        choice.warehouseId,
        (weightByWarehouse.get(choice.warehouseId) ?? 0) +
          choice.unitWeightKg
      );
    }

    const shipments: ShipmentRoute[] = [];
    let totalCost = 0;

    for (const [warehouseId, weight] of weightByWarehouse.entries()) {
      const route = this.findCheapestRoute({
        edges: input.edges,
        fromNode: warehouseId,
        toNode: input.order.destinationNode,
        weight,
        maxDeliveryDays: input.order.maxDeliveryDays
      });

      if (!route) {
        return null;
      }

      shipments.push({
        warehouseId,
        path: route.path,
        totalWeightKg: round2(weight),
        cost: round2(route.cost)
      });

      totalCost += route.cost;
    }

    shipments.sort((a, b) => a.warehouseId.localeCompare(b.warehouseId));

    return {
      choices: [...input.choices].sort((a, b) => {
        if (a.productId !== b.productId) {
          return a.productId.localeCompare(b.productId);
        }

        return a.warehouseId.localeCompare(b.warehouseId);
      }),
      fulfilledCount: input.choices.length,
      totalCost: round2(totalCost),
      shipments
    };
  }

  private findCheapestRoute(input: {
    edges: RouteEdge[];
    fromNode: string;
    toNode: string;
    weight: number;
    maxDeliveryDays: number;
  }): { path: string[]; cost: number; deliveryDays: number } | null {
    type State = {
      node: string;
      path: string[];
      cost: number;
      deliveryDays: number;
    };

    const queue: State[] = [
      {
        node: input.fromNode,
        path: [input.fromNode],
        cost: 0,
        deliveryDays: 0
      }
    ];

    let best: State | null = null;

    while (queue.length > 0) {
      queue.sort((a, b) => {
        if (a.cost !== b.cost) return a.cost - b.cost;
        if (a.deliveryDays !== b.deliveryDays) return a.deliveryDays - b.deliveryDays;
        return a.path.join('>').localeCompare(b.path.join('>'));
      });

      const current = queue.shift()!;

      if (current.node === input.toNode) {
        if (!best || current.cost < best.cost) {
          best = current;
        }

        continue;
      }

      const nextEdges = input.edges
        .filter(
          edge =>
            edge.fromNode === current.node &&
            edge.maxWeightKg >= input.weight &&
            !current.path.includes(edge.toNode)
        )
        .sort((a, b) => {
          if (a.toNode !== b.toNode) {
            return a.toNode.localeCompare(b.toNode);
          }

          return a.id.localeCompare(b.id);
        });

      for (const edge of nextEdges) {
        const nextDeliveryDays = current.deliveryDays + edge.deliveryDays;

        const nextCost =
          current.cost +
          edge.fixedCost +
          edge.costPerKg * input.weight;

        if (best && nextCost > best.cost) {
          continue;
        }

        queue.push({
          node: edge.toNode,
          path: [...current.path, edge.toNode],
          cost: nextCost,
          deliveryDays: nextDeliveryDays
        });
      }
    }

    if (!best) return null;

    return {
      path: best.path,
      cost: round2(best.cost),
      deliveryDays: best.deliveryDays
    };
  }

  private compressAllocations(
    choices: AllocationChoice[]
  ): Allocation[] {
    const map = new Map<string, Allocation>();

    for (const choice of choices) {
      const key = `${choice.productId}:${choice.warehouseId}`;

      const current = map.get(key);

      if (!current) {
        map.set(key, {
          productId: choice.productId,
          warehouseId: choice.warehouseId,
          quantity: 1
        });
      } else {
        current.quantity += 1;
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      if (a.productId !== b.productId) {
        return a.productId.localeCompare(b.productId);
      }

      return a.warehouseId.localeCompare(b.warehouseId);
    });
  }

  private isBetterPlan(
    candidate: CandidatePlan,
    current: CandidatePlan
  ): boolean {
    if (candidate.fulfilledCount !== current.fulfilledCount) {
      return candidate.fulfilledCount > current.fulfilledCount;
    }

    if (candidate.totalCost !== current.totalCost) {
      return candidate.totalCost < current.totalCost;
    }

    if (candidate.shipments.length !== current.shipments.length) {
      return candidate.shipments.length < current.shipments.length;
    }

    const candidateSignature = JSON.stringify({
      allocations: this.compressAllocations(candidate.choices),
      shipments: candidate.shipments
    });

    const currentSignature = JSON.stringify({
      allocations: this.compressAllocations(current.choices),
      shipments: current.shipments
    });

    return candidateSignature < currentSignature;
  }
}

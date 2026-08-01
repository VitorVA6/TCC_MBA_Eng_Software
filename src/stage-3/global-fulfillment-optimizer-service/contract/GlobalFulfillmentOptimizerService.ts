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
  ShipmentRoute,
  UnfulfilledItem
} from './interfaces';

export class GlobalFulfillmentOptimizerService {
  constructor(
    private orderRepository: OrderRepository,
    private stockRepository: StockRepository,
    private warehouseRepository: WarehouseRepository,
    private routeRepository: RouteRepository,
    private fulfillmentPlanRepository: FulfillmentPlanRepository,
    private eventBus: EventBus
  ) {}

  async execute(input: { orderId: string }): Promise<FulfillmentOptimizationResult> {
    const order = await this.orderRepository.findById(input.orderId);
    if (!order || order.status !== 'PAID') {
      return this.emptyResult(input.orderId);
    }

    const uniqueProductIds = Array.from(new Set(order.items.map(i => i.productId)));
    if (uniqueProductIds.length === 0) {
      return this.emptyResult(input.orderId);
    }

    const [stocks, warehouses, routeEdges] = await Promise.all([
      this.stockRepository.getStock(uniqueProductIds),
      this.warehouseRepository.getWarehouses(),
      this.routeRepository.getEdges()
    ]);

    const activeWarehouses = warehouses.filter(w => w.active);
    const activeWarehouseIds = new Set(activeWarehouses.map(w => w.id));

    // Build route graph
    const warehousePaths = new Map<string, Path[]>();
    for (const w of activeWarehouses) {
      warehousePaths.set(w.id, this.getPaths(w.id, order.destinationNode, routeEdges, order.maxDeliveryDays));
    }

    // Filter to warehouses that have at least one valid path
    const validWarehouses = activeWarehouses.filter(w => (warehousePaths.get(w.id) || []).length > 0);
    const validWarehouseIds = new Set(validWarehouses.map(w => w.id));

    // Build stock matrix
    const stockMatrix: Record<string, Record<string, number>> = {};
    for (const w of validWarehouses) {
      stockMatrix[w.id] = {};
    }
    for (const stock of stocks) {
      if (validWarehouseIds.has(stock.warehouseId) && stock.quantity > 0) {
        stockMatrix[stock.warehouseId][stock.productId] = (stockMatrix[stock.warehouseId][stock.productId] || 0) + stock.quantity;
      }
    }

    // Setup DFS state
    const products = order.items.map(item => ({
      productId: item.productId,
      quantity: item.quantity,
      unitWeight: item.unitWeightKg
    }));
    const W = validWarehouses.length;
    
    // Arrays for DFS speed
    const currentAllocated = new Array(products.length).fill(0);
    const currentWeight = new Array(W).fill(0);
    const allocMatrix: number[][] = products.map(() => new Array(W).fill(0));
    
    const maxWarehouseWeight = validWarehouses.map(w => {
      const paths = warehousePaths.get(w.id) || [];
      return paths.reduce((max, p) => Math.max(max, p.maxWeightKg), 0);
    });

    const remainingQty = new Array(products.length).fill(0);
    for (let i = products.length - 1; i >= 0; i--) {
      remainingQty[i] = products[i].quantity + (i + 1 < products.length ? remainingQty[i+1] : 0);
    }

    const state: { bestPlan: Plan | null } = { bestPlan: null };

    const round2 = (num: number) => Math.round(num * 100) / 100;

    const evaluatePlan = () => {
      let totalCost = 0;
      let isValid = true;
      const shipments: ShipmentRoute[] = [];
      const allocations: Allocation[] = [];

      for (let w = 0; w < W; w++) {
        const weight = currentWeight[w];
        if (weight > 0) {
          const roundedWeight = round2(weight);
          let bestPath: Path | null = null;
          let minPathCost = Infinity;

          const paths = warehousePaths.get(validWarehouses[w].id) || [];
          for (const path of paths) {
            if (path.maxWeightKg >= weight) {
              const cost = path.fixedCost + path.costPerKg * roundedWeight;
              if (cost < minPathCost) {
                minPathCost = cost;
                bestPath = path;
              } else if (cost === minPathCost && bestPath) {
                if (JSON.stringify(path.nodes) < JSON.stringify(bestPath.nodes)) {
                  bestPath = path;
                }
              }
            }
          }

          if (!bestPath) {
            isValid = false;
            break;
          }

          const roundedCost = round2(minPathCost);
          totalCost += roundedCost;

          shipments.push({
            warehouseId: validWarehouses[w].id,
            path: bestPath.nodes,
            totalWeightKg: roundedWeight,
            cost: roundedCost
          });
        }
      }

      if (!isValid) return;

      totalCost = round2(totalCost);
      let totalFulfilled = 0;

      for (let p = 0; p < products.length; p++) {
        for (let w = 0; w < W; w++) {
          const qty = allocMatrix[p][w];
          if (qty > 0) {
            allocations.push({
              warehouseId: validWarehouses[w].id,
              productId: products[p].productId,
              quantity: qty
            });
            totalFulfilled += qty;
          }
        }
      }

      allocations.sort((a, b) => a.warehouseId.localeCompare(b.warehouseId) || a.productId.localeCompare(b.productId));
      const tieBreakerString = JSON.stringify(allocations);

      const plan: Plan = {
        totalFulfilled,
        totalCost,
        tieBreakerString,
        allocations,
        shipments
      };

      if (!state.bestPlan || this.isBetter(plan, state.bestPlan)) {
        state.bestPlan = plan;
      }
    };

    const dfs = (p: number, w: number, currentFulfilled: number) => {
      const maxPossibleRemaining = (products[p] ? products[p].quantity - currentAllocated[p] : 0) 
                                 + (p + 1 < products.length ? remainingQty[p+1] : 0);
                                 
      if (state.bestPlan && (currentFulfilled + maxPossibleRemaining < state.bestPlan.totalFulfilled)) {
        return; // Prune
      }

      if (p === products.length) {
        evaluatePlan();
        return;
      }

      if (w === W) {
        dfs(p + 1, 0, currentFulfilled);
        return;
      }

      const product = products[p];
      const maxCanTake = Math.min(
        product.quantity - currentAllocated[p],
        stockMatrix[validWarehouses[w].id]?.[product.productId] || 0
      );

      for (let take = 0; take <= maxCanTake; take++) {
        const weightAdded = take * product.unitWeight;
        if (currentWeight[w] + weightAdded > maxWarehouseWeight[w]) {
          continue; 
        }

        currentAllocated[p] += take;
        currentWeight[w] += weightAdded;
        allocMatrix[p][w] = take;

        dfs(p, w + 1, currentFulfilled + take);

        currentAllocated[p] -= take;
        currentWeight[w] -= weightAdded;
        allocMatrix[p][w] = 0;
      }
    };

    if (W > 0) {
      dfs(0, 0, 0);
    }

    let status: 'FULFILLED' | 'PARTIALLY_FULFILLED' | 'NOT_FULFILLED' = 'NOT_FULFILLED';
    const unfulfilledItems: UnfulfilledItem[] = [];

    if (state.bestPlan && state.bestPlan.totalFulfilled > 0) {
      const totalRequested = products.reduce((sum, p) => sum + p.quantity, 0);
      status = state.bestPlan.totalFulfilled === totalRequested ? 'FULFILLED' : 'PARTIALLY_FULFILLED';

      for (let p = 0; p < products.length; p++) {
        let fulfilledQty = 0;
        for (const alloc of state.bestPlan.allocations) {
          if (alloc.productId === products[p].productId) {
            fulfilledQty += alloc.quantity;
          }
        }
        unfulfilledItems.push({
          productId: products[p].productId,
          requestedQuantity: products[p].quantity,
          fulfilledQuantity: fulfilledQty
        });
      }
    } else {
      for (const p of products) {
        unfulfilledItems.push({
          productId: p.productId,
          requestedQuantity: p.quantity,
          fulfilledQuantity: 0
        });
      }
      state.bestPlan = {
        totalFulfilled: 0,
        totalCost: 0,
        tieBreakerString: '',
        allocations: [],
        shipments: []
      };
    }

    const result: FulfillmentOptimizationResult = {
      orderId: input.orderId,
      status,
      allocations: state.bestPlan.allocations,
      shipments: state.bestPlan.shipments,
      unfulfilledItems,
      totalCost: state.bestPlan.totalCost
    };

    await this.fulfillmentPlanRepository.save(result);

    if (status === 'FULFILLED') {
      await this.eventBus.publish('fulfillment.optimized', { orderId: input.orderId });
    } else if (status === 'PARTIALLY_FULFILLED') {
      await this.eventBus.publish('fulfillment.partial', { orderId: input.orderId });
    }

    return result;
  }

  private emptyResult(orderId: string): FulfillmentOptimizationResult {
    return {
      orderId,
      status: 'NOT_FULFILLED',
      allocations: [],
      shipments: [],
      unfulfilledItems: [],
      totalCost: 0
    };
  }

  private getPaths(fromNode: string, toNode: string, routeEdges: RouteEdge[], maxDeliveryDays: number): Path[] {
    const paths: Path[] = [];
    const visited = new Set<string>();

    const dfsPath = (current: string, currentPath: string[], days: number, minMaxWeight: number, fCost: number, cCost: number) => {
      if (days > maxDeliveryDays) return;

      if (current === toNode) {
        paths.push({
          nodes: [...currentPath],
          totalDeliveryDays: days,
          maxWeightKg: minMaxWeight,
          fixedCost: fCost,
          costPerKg: cCost
        });
        return;
      }

      visited.add(current);
      const edges = routeEdges.filter(e => e.fromNode === current && e.active);
      for (const edge of edges) {
        if (!visited.has(edge.toNode)) {
          currentPath.push(edge.toNode);
          dfsPath(
            edge.toNode,
            currentPath,
            days + edge.deliveryDays,
            Math.min(minMaxWeight, edge.maxWeightKg),
            fCost + edge.fixedCost,
            cCost + edge.costPerKg
          );
          currentPath.pop();
        }
      }
      visited.delete(current);
    };

    dfsPath(fromNode, [fromNode], 0, Infinity, 0, 0);
    return paths;
  }

  private isBetter(a: Plan, b: Plan): boolean {
    if (a.totalFulfilled !== b.totalFulfilled) {
      return a.totalFulfilled > b.totalFulfilled;
    }
    const diff = a.totalCost - b.totalCost;
    if (Math.abs(diff) > 0.0001) {
      return diff < 0;
    }
    return a.tieBreakerString < b.tieBreakerString;
  }
}

interface Path {
  nodes: string[];
  totalDeliveryDays: number;
  maxWeightKg: number;
  fixedCost: number;
  costPerKg: number;
}

interface Plan {
  totalFulfilled: number;
  totalCost: number;
  tieBreakerString: string;
  allocations: Allocation[];
  shipments: ShipmentRoute[];
}

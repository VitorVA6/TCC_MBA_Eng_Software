import {
  UserRepository,
  EmailService,
  User
} from '../../stage-1/register-user-service/contract/interfaces';

export class RegisterUserService {
  constructor(
    private userRepository: UserRepository,
    private emailService: EmailService
  ) {}

  async execute(input: {
    name: string;
    email: string;
  }): Promise<User> {
    const name = input.name?.trim();
    const email = input.email?.trim().toLowerCase();

    if (!name) {
      throw new Error('Invalid name');
    }

    if (!email || !this.isValidEmail(email)) {
      throw new Error('Invalid email');
    }

    const existing = await this.userRepository.findByEmail(email);

    if (existing) {
      throw new Error('Email already registered');
    }

    const created = await this.userRepository.save({
      name,
      email
    });

    await this.emailService.sendWelcomeEmail(
      created.email,
      created.name
    );

    return created;
  }

  private isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    return emailRegex.test(email);
  }
}
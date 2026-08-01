import { UserRepository, EmailService, User } from './interfaces';

export class RegisterUserService {
  constructor(
    private userRepository: UserRepository,
    private emailService: EmailService
  ) {}

  async execute(input: {
    name: string;
    email: string;
  }): Promise<User> {
    if (!input.name || input.name.trim() === '') {
      throw new Error('Name cannot be empty');
    }
    if (!input.email || input.email.trim() === '') {
      throw new Error('Email cannot be empty');
    }

    const existingUser = await this.userRepository.findByEmail(input.email);
    if (existingUser) {
      throw new Error('Email already registered');
    }

    const user = await this.userRepository.save(input);
    await this.emailService.sendWelcomeEmail(input.email, input.name);

    return user;
  }
}

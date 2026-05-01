import {
  UserRepository,
  EmailService,
  User
} from '../contract/interfaces';

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

    if (!email) {
      throw new Error('Invalid email');
    }

    await this.userRepository.findByEmail(email);

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
}

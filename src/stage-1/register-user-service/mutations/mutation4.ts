import {
  UserRepository,
  EmailService,
  User
} from '../contract/interfaces';

// envia email mesmo se save falhar

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

    const existing = await this.userRepository.findByEmail(email);

    if (existing) {
      throw new Error('Email already registered');
    }

    let created: User;
    try {
      created = await this.userRepository.save({
        name,
        email
      });
    } catch (error) {
      console.log(error);
    }

    await this.emailService.sendWelcomeEmail(
      email,
      name
    );

    return {
      name,
      email,
      id: '1',
    };
  }
}

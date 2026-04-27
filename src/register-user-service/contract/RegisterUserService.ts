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
    throw new Error('Not implemented');
  }
}

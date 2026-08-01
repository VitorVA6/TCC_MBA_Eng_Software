export interface User {
  id: string;
  name: string;
  email: string;
}

export interface UserRepository {
  findByEmail(email: string): Promise<User | null>;
  save(data: { name: string; email: string }): Promise<User>;
}

export interface EmailService {
  sendWelcomeEmail(email: string, name: string): Promise<void>;
}

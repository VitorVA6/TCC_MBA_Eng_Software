import { RegisterUserService } from '../mutations/mutation4';
import { UserRepository, EmailService } from './interfaces';

describe('RegisterUserService', () => {
  let registerUserService: RegisterUserService;
  let userRepositoryMock: jest.Mocked<UserRepository>;
  let emailServiceMock: jest.Mocked<EmailService>;

  beforeEach(() => {
    userRepositoryMock = {
      findByEmail: jest.fn(),
      save: jest.fn(),
    };

    emailServiceMock = {
      sendWelcomeEmail: jest.fn(),
    };

    registerUserService = new RegisterUserService(
      userRepositoryMock,
      emailServiceMock
    );
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('execute', () => {
    it('should successfully register a user and return the created user', async () => {
      const input = { name: 'John Doe', email: 'john@example.com' };
      const createdUser = { id: '1', ...input };

      userRepositoryMock.findByEmail.mockResolvedValue(null);
      userRepositoryMock.save.mockResolvedValue(createdUser);

      const result = await registerUserService.execute(input);

      expect(result).toEqual(createdUser);
      expect(userRepositoryMock.findByEmail).toHaveBeenCalledWith(input.email);
      expect(userRepositoryMock.save).toHaveBeenCalledWith({ name: input.name, email: input.email });
      expect(emailServiceMock.sendWelcomeEmail).toHaveBeenCalledWith(input.email, input.name);
    });

    it('should throw an error when name is empty', async () => {
      const input = { name: '', email: 'john@example.com' };

      await expect(registerUserService.execute(input)).rejects.toThrow();
      
      expect(userRepositoryMock.findByEmail).not.toHaveBeenCalled();
      expect(userRepositoryMock.save).not.toHaveBeenCalled();
      expect(emailServiceMock.sendWelcomeEmail).not.toHaveBeenCalled();
    });

    it('should throw an error when email is empty', async () => {
      const input = { name: 'John Doe', email: ' ' };

      await expect(registerUserService.execute(input)).rejects.toThrow();

      expect(userRepositoryMock.findByEmail).not.toHaveBeenCalled();
      expect(userRepositoryMock.save).not.toHaveBeenCalled();
      expect(emailServiceMock.sendWelcomeEmail).not.toHaveBeenCalled();
    });

    it('should throw an error if email already exists', async () => {
      const input = { name: 'John Doe', email: 'john@example.com' };
      const existingUser = { id: '1', name: 'Existing User', email: input.email };

      userRepositoryMock.findByEmail.mockResolvedValue(existingUser);

      await expect(registerUserService.execute(input)).rejects.toThrow();

      expect(userRepositoryMock.findByEmail).toHaveBeenCalledWith(input.email);
      expect(userRepositoryMock.save).not.toHaveBeenCalled();
      expect(emailServiceMock.sendWelcomeEmail).not.toHaveBeenCalled();
    });

    it('should not send email if user creation fails', async () => {
      const input = { name: 'John Doe', email: 'john@example.com' };

      userRepositoryMock.findByEmail.mockResolvedValue(null);
      userRepositoryMock.save.mockRejectedValue(new Error('Database error'));

      await expect(registerUserService.execute(input)).rejects.toThrow('Database error');

      expect(userRepositoryMock.save).toHaveBeenCalledWith({ name: input.name, email: input.email });
      expect(emailServiceMock.sendWelcomeEmail).not.toHaveBeenCalled();
    });
  });
});

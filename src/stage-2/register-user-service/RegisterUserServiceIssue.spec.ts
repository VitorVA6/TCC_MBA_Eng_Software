import { RegisterUserService } from './correct';
import { UserRepository, EmailService, User } from '../../stage-1/register-user-service/contract/interfaces';

describe('RegisterUserService', () => {
  let userRepositoryMock: jest.Mocked<UserRepository>;
  let emailServiceMock: jest.Mocked<EmailService>;
  let registerUserService: RegisterUserService;

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

  it('deve registrar o usuário com sucesso com nome e e-mail válidos', async () => {
    const input = { name: 'John Doe', email: 'john@example.com' };
    const savedUser: User = { id: '123', name: 'John Doe', email: 'john@example.com' };
    
    userRepositoryMock.findByEmail.mockResolvedValue(null);
    userRepositoryMock.save.mockResolvedValue(savedUser);
    
    const result = await registerUserService.execute(input);
    
    expect(userRepositoryMock.findByEmail).toHaveBeenCalledWith(input.email);
    expect(userRepositoryMock.save).toHaveBeenCalledWith(input);
    expect(emailServiceMock.sendWelcomeEmail).toHaveBeenCalledWith(input.email, input.name);
    expect(result).toEqual(savedUser);
  });

  it('deve lançar um erro quando o nome estiver vazio', async () => {
    const input = { name: '', email: 'john@example.com' };
    
    await expect(registerUserService.execute(input)).rejects.toThrow();
    
    expect(userRepositoryMock.findByEmail).not.toHaveBeenCalled();
    expect(userRepositoryMock.save).not.toHaveBeenCalled();
    expect(emailServiceMock.sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it('deve lançar um erro quando o e-mail estiver vazio', async () => {
    const input = { name: 'John Doe', email: '' };
    
    await expect(registerUserService.execute(input)).rejects.toThrow();
    
    expect(userRepositoryMock.findByEmail).not.toHaveBeenCalled();
    expect(userRepositoryMock.save).not.toHaveBeenCalled();
    expect(emailServiceMock.sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it('deve lançar um erro se o e-mail já existir', async () => {
    const input = { name: 'John Doe', email: 'john@example.com' };
    const existingUser: User = { id: '123', name: 'Existing', email: 'john@example.com' };
    
    userRepositoryMock.findByEmail.mockResolvedValue(existingUser);
    
    await expect(registerUserService.execute(input)).rejects.toThrow();
    
    expect(userRepositoryMock.findByEmail).toHaveBeenCalledWith(input.email);
    expect(userRepositoryMock.save).not.toHaveBeenCalled();
    expect(emailServiceMock.sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it('não deve enviar e-mail se a criação falhar', async () => {
    const input = { name: 'John Doe', email: 'john@example.com' };
    
    userRepositoryMock.findByEmail.mockResolvedValue(null);
    userRepositoryMock.save.mockRejectedValue(new Error('DB Error'));
    
    await expect(registerUserService.execute(input)).rejects.toThrow('DB Error');
    
    expect(userRepositoryMock.save).toHaveBeenCalledWith(input);
    expect(emailServiceMock.sendWelcomeEmail).not.toHaveBeenCalled();
  });

  it('deve lançar um erro quando o e-mail tiver um formato inválido', async () => {
    const input = { name: 'John Doe', email: 'john @example.com' };
    
    await expect(registerUserService.execute(input)).rejects.toThrow('Invalid email');
    
    expect(userRepositoryMock.findByEmail).not.toHaveBeenCalled();
    expect(userRepositoryMock.save).not.toHaveBeenCalled();
    expect(emailServiceMock.sendWelcomeEmail).not.toHaveBeenCalled();
  });
});

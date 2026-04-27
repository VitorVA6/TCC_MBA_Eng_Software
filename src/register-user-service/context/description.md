# RegisterUserService

This service is responsible for registering new users.

It depends on:

- UserRepository: persistence and user lookup
- EmailService: sends welcome emails

Expected business flow:

1. Validate input data
2. Check if the email is already registered
3. Persist the new user
4. Send welcome email
5. Return the created user
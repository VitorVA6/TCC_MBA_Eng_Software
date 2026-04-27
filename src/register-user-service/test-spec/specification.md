The generated test suite must validate:

1. Successful user registration with valid name and email
2. Name must be non-empty
3. Email must be non-empty
4. Should throw an error if email already exists
5. Should save the user using repository
6. Should send welcome email after successful creation
7. Should return the created user object
8. Should not send email if creation fails
9. Should not save user when validation fails
10. Repository methods must receive correct arguments
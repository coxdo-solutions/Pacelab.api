// src/auth/dto/register.dto.ts
export class RegisterDto {
  email: string;
  password: string;
  name?: string;
  // add any other sign-up fields (role, phone, etc.) if needed
}

// src/users/users.controller.ts
import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Delete,
  Patch,
  UseGuards,
  UploadedFile,
  UseInterceptors,
  Req,
} from '@nestjs/common';
import { UsersService } from './users.service';
import { CreateUserDto } from './dto/create-user.dto';
import { BulkCreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { FileInterceptor } from '@nestjs/platform-express';
import * as csv from 'csv-parse/sync';
import { Role } from '@prisma/client';

@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  /** ✅ Create a new user with assigned courses */
  @Post()
  create(@Body() createUserDto: CreateUserDto) {
    return this.usersService.create(createUserDto);
  }

@UseGuards(JwtAuthGuard)
@Post('bulk-upload')
@UseInterceptors(FileInterceptor('file'))
async bulkUpload(
  @UploadedFile() file: Express.Multer.File,
  @Req() req: any,
) {
  // ✅ Only admins allowed
  if (req.user?.role !== Role.ADMIN) {
    return { ok: false, message: 'Only admins can upload users' };
  }

  if (!file) {
    return { ok: false, message: 'No file uploaded' };
  }

  // ✅ Parse CSV file
  const records = csv.parse(file.buffer.toString(), {
    columns: true,
    skip_empty_lines: true,
  }) as BulkCreateUserDto[];

  const results = [];

  for (const row of records) {
    try {
      // ✅ Extract course names from CSV
      const courseNames =
        typeof row.assignedCourseNames === 'string'
          ? row.assignedCourseNames.split(',').map((n) => n.trim())
          : Array.isArray(row.assignedCourseNames)
            ? row.assignedCourseNames
            : [];

      // ✅ Get course IDs from DB
      const assignedCourseIds = await this.usersService.getCourseIdsByNames(courseNames);

      if (!assignedCourseIds.length) {
        console.warn(`⚠️ No valid course IDs found for ${row.email}`);
        continue;
      }

      // ✅ Map role safely (fallback to STUDENT if not provided/invalid)
      const role =
        row.role && Role[row.role as keyof typeof Role]
          ? Role[row.role as keyof typeof Role]
          : Role.STUDENT;

      // ✅ Create user
      const userDto: CreateUserDto = {
        name: row.name,
        email: row.email,
        password: row.password,
        role,
      };

      const newUser = await this.usersService.create(userDto);

      // ✅ Assign courses to user
      await this.usersService.assignCoursesToUser(newUser.id, assignedCourseIds);

      results.push({
        email: row.email,
        status: 'success',
        assignedCourses: assignedCourseIds,
      });
    } catch (err) {
      console.error(`❌ Failed for row ${row.email}:`, err);
      results.push({
        email: row.email,
        status: 'failed',
        error: err.message,
      });
    }
  }

  return { ok: true, results };
}



  /** ✅ Get all users with courses */
  @Get()
  findAll() {
    return this.usersService.findAll();
  }

  /** ✅ Get one user with courses */
  @Get(':id')
  findOne(@Param('id') id: string) {
    return this.usersService.findOne(id);
  }

  /** ✅ Get the user's courses (deep: modules + lessons) */
  @Get(':id/courses')
  findUserCourses(@Param('id') id: string) {
    return this.usersService.getUserCourses(id);
  }

  /** ✅ Update user details & assigned courses */
  @Patch(':id')
  update(@Param('id') id: string, @Body() updateUserDto: UpdateUserDto) {
    return this.usersService.update(id, updateUserDto);
  }

  /** ✅ Toggle status (Active/Suspended) */
  @Patch(':id/status')
  toggleStatus(
    @Param('id') id: string,
    @Body('status') status: 'ACTIVE' | 'SUSPENDED',
  ) {
    return this.usersService.updateStatus(id as any, status as any);
  }

  /** ✅ Delete a user */
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.usersService.remove(id);
  }


}

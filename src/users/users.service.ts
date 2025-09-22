// src/users/users.service.ts
import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { UserStatus } from '@prisma/client';
import * as bcrypt from 'bcryptjs';

@Injectable()
export class UsersService {
   findCourseByName(courseName: any) {
    throw new Error('Method not implemented.');
  }
  constructor(private readonly prisma: PrismaService) {}

  /** ✅ Create User */
  async create(createUserDto: CreateUserDto) {
    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);
    const { password, assignedCourseIds, ...userData } = createUserDto;

    return this.prisma.user.create({
      data: {
        ...userData,
        password: hashedPassword,
        ...(assignedCourseIds?.length
          ? {
              assignedCourses: {
                connect: assignedCourseIds.map((id) => ({ id })),
              },
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        createdAt: true,
        role: true,
        assignedCourses: { select: { id: true, title: true } },
      },
    });
  }

  /** ✅ Get All Users */
  async findAll() {
    return this.prisma.user.findMany({
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        createdAt: true,
        role: true,
        assignedCourses: { select: { id: true, title: true } },
      },
    });
  }

  /** ✅ Get One User */
  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        createdAt: true,
        role: true,
        assignedCourses: { select: { id: true, title: true } },
      },
    });
    if (!user) throw new NotFoundException(`User with ID ${id} not found`);
    return user;
  }

  /** ✅ Find user by email (needed for AuthService) */
  async findByEmail(email: string) {
    return this.prisma.user.findUnique({
      where: { email },
      select: {
        id: true,
        name: true,
        email: true,
        password: true,
        status: true,
        role: true,
        assignedCourses: { select: { id: true, title: true } },
      },
    });
  }

  /** ✅ Update User (details & assigned courses) */
  async update(id: string, updateUserDto: UpdateUserDto) {
    const exists = await this.prisma.user.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException(`User with ID ${id} not found`);

    const { password: newPassword, assignedCourseIds, ...rest } = updateUserDto;
    const hashedPassword = newPassword ? await bcrypt.hash(newPassword, 10) : undefined;

    return this.prisma.user.update({
      where: { id },
      data: {
        ...rest,
        ...(hashedPassword && { password: hashedPassword }),
        ...(Array.isArray(assignedCourseIds)
          ? {
              assignedCourses: {
                set: assignedCourseIds.map((courseId) => ({ id: courseId })),
              },
            }
          : {}),
      },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        createdAt: true,
        role: true,
        assignedCourses: { select: { id: true, title: true } },
      },
    });
  }

  /** ✅ Update Status Only */
  async updateStatus(id: string, status: UserStatus) {
    const exists = await this.prisma.user.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException(`User with ID ${id} not found`);

    return this.prisma.user.update({
      where: { id },
      data: { status },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        createdAt: true,
        role: true,
      },
    });
  }

  /** ✅ Get courses assigned/enrolled to a user (with modules and lessons) */
  async getUserCourses(userId: string) {
    const userWithCourses = await this.prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        // include the relation explicitly via SELECT
        assignedCourses: {
          orderBy: { createdAt: 'desc' },
          select: {
            id: true,
            title: true,
            description: true,
            modules: {
              orderBy: { order: 'asc' },
              select: {
                id: true,
                title: true,
                order: true,
                lessons: {
                  orderBy: { order: 'asc' },
                  select: {
                    id: true,
                    title: true,
                    duration: true,
                    order: true,
                    videoUrl: true,
                    youtubeId: true,
                    // Include lesson progress for this specific user
                    lessonProgress: {
                      where: { userId: userId },
                      select: {
                        status: true,
                        lastWatchedAt: true,
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    if (!userWithCourses) {
      throw new NotFoundException(`User with ID ${userId} not found`);
    }

    // Transform the data to include totals and progress
    const coursesWithProgress = userWithCourses.assignedCourses.map(course => {
      let totalLessons = 0;
      let completedLessons = 0;

      const modulesWithProgress = course.modules.map(module => {
        const lessonsWithProgress = module.lessons.map(lesson => {
          totalLessons++;

          const progress = lesson.lessonProgress[0]; // Should be 0 or 1 since we filtered by userId
          const isCompleted = progress?.status === 'COMPLETED';

          if (isCompleted) {
            completedLessons++;
          }

          return {
            id: lesson.id,
            title: lesson.title,
            duration: lesson.duration,
            order: lesson.order,
            videoUrl: lesson.videoUrl,
            youtubeId: lesson.youtubeId,
            status: progress?.status || 'NOT_STARTED',
            lastWatchedAt: progress?.lastWatchedAt || null,
            isCompleted,
          };
        });

        return {
          id: module.id,
          title: module.title,
          order: module.order,
          lessons: lessonsWithProgress,
        };
      });

      const progressPercentage = totalLessons > 0 ? Math.round((completedLessons / totalLessons) * 100) : 0;

      return {
        id: course.id,
        title: course.title,
        description: course.description,
        totalLessons,
        completedLessons,
        progressPercentage,
        modules: modulesWithProgress,
      };
    });

    return coursesWithProgress;
  }

  /** ✅ Delete User */
  async remove(id: string) {
    const exists = await this.prisma.user.findUnique({ where: { id } });
    if (!exists) throw new NotFoundException(`User with ID ${id} not found`);

    return this.prisma.user.delete({
      where: { id },
      select: {
        id: true,
        name: true,
        email: true,
        status: true,
        createdAt: true,
        role: true,
      },
    });
  }

  async getCourseIdsByNames(names: string[]): Promise<string[]> {
  if (!names.length) return [];

  const courses = await this.prisma.course.findMany({
    where: {
      title: { in: names },
    },
    select: { id: true, title: true },
  });

  // Return IDs that match the provided names
  return courses.map((c) => c.id);
}

/** Assign courses to a user (overwrites previous assignments) */
async assignCoursesToUser(userId: string, courseIds: string[]) {
  return this.prisma.user.update({
    where: { id: userId },
    data: {
      assignedCourses: {
        set: courseIds.map((id) => ({ id })),
      },
    },
    select: {
      id: true,
      assignedCourses: { select: { id: true, title: true } },
    },
  });
}

async createLoginActivity({ userId, ipAddress, userAgent }: { userId: string; ipAddress?: string; userAgent?: string }) {
  return this.prisma.loginActivity.create({
    data: {
      userId,
      ipAddress,
      userAgent,
    },
  });
}
}


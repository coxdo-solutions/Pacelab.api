// src/admin/admin.controller.ts
import { Controller, Get, Res } from '@nestjs/common';
import { AdminService } from './admin.service';
import { PrismaService } from '../prisma/prisma.service';
import { Response } from 'express';


@Controller('admin')
export class AdminController {
  constructor(
    private readonly adminService: AdminService,
    private readonly prisma: PrismaService,
  ) {}

  @Get('stats')
  async getStats() {
    const stats = await this.adminService.getStats();
    const categories = await this.adminService.getCategoryDistribution();
    return { ...stats, categories };
  }

  @Get('user-progress-report')
  async downloadUserProgressReport(@Res() res: Response) {
    // Get all students with their login activities and lesson progress
    const users = await this.prisma.user.findMany({
      where: { role: 'STUDENT' },
      select: {
        id: true,
        name: true,
        email: true,
        loginActivities: {
          orderBy: { loginAt: 'asc' },
          select: { loginAt: true },
        },
        lessonProgress: {
          select: {
            status: true,
            lastWatchedAt: true,
            lesson: {
              select: {
                id: true,
                title: true,
                module: {
                  select: {
                    title: true,
                    course: {
                      select: { id: true, title: true }
                    }
                  }
                }
              }
            }
          }
        }
      }
    });

    // Flatten data for CSV
    const rows: any[] = [];
    users.forEach(user => {
      const firstLogin = user.loginActivities[0]?.loginAt;
      const totalLogins = user.loginActivities.length;

      if (user.lessonProgress.length === 0) {
        // User with no lesson progress
        rows.push({
          userId: user.id,
          name: user.name,
          email: user.email,
          firstLogin: firstLogin ? firstLogin.toISOString() : 'Never',
          totalLogins,
          courseId: '',
          courseTitle: '',
          moduleTitle: '',
          lessonId: '',
          lessonTitle: '',
          status: 'NO_PROGRESS',
          lastWatchedAt: '',
        });
      } else {
        // User with lesson progress
        user.lessonProgress.forEach(lp => {
          rows.push({
            userId: user.id,
            name: user.name,
            email: user.email,
            firstLogin: firstLogin ? firstLogin.toISOString() : 'Never',
            totalLogins,
            courseId: lp.lesson.module.course.id,
            courseTitle: lp.lesson.module.course.title,
            moduleTitle: lp.lesson.module.title,
            lessonId: lp.lesson.id,
            lessonTitle: lp.lesson.title,
            status: lp.status,
            lastWatchedAt: lp.lastWatchedAt ? lp.lastWatchedAt.toISOString() : '',
          });
        });
      }
    });

    // Create CSV manually to avoid json2csv dependency issues
    const headers = [
      'User ID', 'Name', 'Email', 'First Login', 'Total Logins',
      'Course ID', 'Course Title', 'Module Title', 'Lesson ID',
      'Lesson Title', 'Status', 'Last Watched At'
    ];

    const csvRows = [headers.join(',')];

    rows.forEach(row => {
      const values = [
        row.userId,
        `"${(row.name || '').replace(/"/g, '""')}"`,
        `"${(row.email || '').replace(/"/g, '""')}"`,
        row.firstLogin,
        row.totalLogins,
        row.courseId || '',
        `"${(row.courseTitle || '').replace(/"/g, '""')}"`,
        `"${(row.moduleTitle || '').replace(/"/g, '""')}"`,
        row.lessonId || '',
        `"${(row.lessonTitle || '').replace(/"/g, '""')}"`,
        row.status,
        row.lastWatchedAt,
      ];
      csvRows.push(values.join(','));
    });

    const csv = csvRows.join('\n');

    res.header('Content-Type', 'text/csv');
    res.attachment('user-progress-report.csv');
    return res.send(csv);
  }
}

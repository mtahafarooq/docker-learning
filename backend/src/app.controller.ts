import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
} from '@nestjs/common';
import { AppService } from './app.service';

interface CreateUserDto {
  name?: string;
  email?: string;
}

@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /** Which container am I talking to? Refresh to watch it change across replicas. */
  @Get()
  info() {
    return this.appService.info();
  }

  /** Checks that this instance can reach Postgres and Redis. */
  @Get('health')
  health() {
    return this.appService.health();
  }

  /** Increments a counter stored in Redis. Refresh repeatedly: it keeps rising
   *  even though the request may land on a different backend each time. */
  @Get('visits')
  visits() {
    return this.appService.recordVisit();
  }

  /** Reads rows from PostgreSQL. Data survives restarts (it lives in a volume). */
  @Get('users')
  users() {
    return this.appService.listUsers();
  }

  /** Writes a row to PostgreSQL. */
  @Post('users')
  createUser(@Body() body: CreateUserDto) {
    const name = body?.name?.trim();
    const email = body?.email?.trim();

    if (!name || !email) {
      throw new BadRequestException('name and email are required');
    }
    if (!email.includes('@')) {
      throw new BadRequestException('email looks invalid');
    }

    return this.appService.createUser(name, email);
  }
}

import { NestFactory } from '@nestjs/core';
import { Logger } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = Number(process.env.PORT ?? 3000);

  // 0.0.0.0 is important inside containers: binding to 127.0.0.1 would make the
  // service unreachable from other containers (nginx, your host, etc).
  await app.listen(port, '0.0.0.0');

  Logger.log(
    `backend listening on http://0.0.0.0:${port} (instance: ${process.pid})`,
    'Bootstrap',
  );
}

bootstrap();

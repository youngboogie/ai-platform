import {
  Controller,
  Post,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  Req,
  Get,
  Delete,
  Param,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { DocsService } from './docs.service';
import { normalizeUploadedFileName } from './file-name.util';

type JwtUser = {
  sub: string;
  email: string;
};

@Controller('docs')
export class DocsController {
  constructor(private readonly docsService: DocsService) {}

  @Post('upload')
  @UseGuards(JwtAuthGuard)
  @UseInterceptors(
    FileInterceptor('file', {
      storage: diskStorage({
        destination: './uploads',
        filename: (_req, file, cb) => {
          const normalizedName = normalizeUploadedFileName(file.originalname);
          file.originalname = normalizedName;
          const uniqueName = `${Date.now()}-${normalizedName}`;
          cb(null, uniqueName);
        },
      }),
    }),
  )
  uploadFile(
    @UploadedFile() file: Express.Multer.File,
    @Req() req: { user: JwtUser },
  ) {
    return this.docsService.uploadDocument(req.user.sub, file);
  }

  @Get()
  @UseGuards(JwtAuthGuard)
  getMyDocs(@Req() req: { user: JwtUser }) {
    return this.docsService.getUserDocuments(req.user.sub);
  }

  @Delete(':id')
  @UseGuards(JwtAuthGuard)
  deleteDoc(@Param('id') id: string, @Req() req: { user: JwtUser }) {
    return this.docsService.deleteDocument(req.user.sub, id);
  }
}

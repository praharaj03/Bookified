import { z } from 'zod';
import {MAX_FILE_SIZE, ACCEPTED_PDF_TYPES, ACCEPTED_IMAGE_TYPES, MAX_IMAGE_SIZE, voiceOptions} from './constants';

export const UploadSchema = z.object({
    title: z.string().trim().min(1, "Title is required").max(100, "Title is too long"),
    author: z.string().trim().min(1, "Author name is required").max(100, "Author name is too long"),
    persona: z.enum(Object.keys(voiceOptions) as [keyof typeof voiceOptions, ...Array<keyof typeof voiceOptions>]),
    pdfFile: z.instanceof(File, { message: "PDF file is required" })
        .refine((file) => file.size <= MAX_FILE_SIZE, "File size must be less than 50MB")
        .refine((file) => file.size > 0, "PDF file is empty")
        .refine((file) => ACCEPTED_PDF_TYPES.includes(file.type), "Only PDF files are accepted"),
    coverImage: z.instanceof(File).optional()
        .refine((file) => !file || file.size > 0, "Image file is empty")
        .refine((file) => !file || file.size <= MAX_IMAGE_SIZE, "Image size must be less than 10MB")
        .refine((file) => !file || ACCEPTED_IMAGE_TYPES.includes(file.type), "Only .jpg, .jpeg, .png and .webp formats are supported"),
});

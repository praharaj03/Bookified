"use client";

import { useEffect, useRef } from "react";
import type { FieldValues, ControllerRenderProps } from "react-hook-form";
import { X } from "lucide-react";
import type { FileUploadFieldProps } from "@/types";
import { cn } from "@/lib/utils";
import { FormField, FormItem, FormLabel, FormControl, FormMessage } from "@/components/ui/form";

function UploadInput<T extends FieldValues>({ field, ...props }: FileUploadFieldProps<T> & { field: ControllerRenderProps<T> }) {
  const { label, acceptTypes, disabled, icon: Icon, placeholder, hint } = props;
  const inputRef = useRef<HTMLInputElement>(null);
  const { value, onChange } = field;
  useEffect(() => {
    if (!value && inputRef.current) inputRef.current.value = "";
  }, [value]);

  return (
    <FormItem className="w-full">
      <FormLabel className="form-label">{label}</FormLabel>
      <FormControl>
        <div
          className={cn("upload-dropzone border-2 border-dashed border-[#8B7355]/20", !!value && "upload-dropzone-uploaded")}
          role="button"
          tabIndex={disabled ? -1 : 0}
          aria-label={label}
          aria-disabled={disabled}
          onClick={() => { if (!disabled) inputRef.current?.click(); }}
          onKeyDown={(event) => {
            if (event.target === event.currentTarget && !disabled && (event.key === "Enter" || event.key === " ")) {
              event.preventDefault();
              inputRef.current?.click();
            }
          }}
          onDragOver={(event) => event.preventDefault()}
          onDrop={(event) => {
            event.preventDefault();
            if (!disabled && event.dataTransfer.files[0]) onChange(event.dataTransfer.files[0]);
          }}
        >
          <input
            type="file"
            accept={acceptTypes.join(",")}
            className="hidden"
            ref={(element) => { inputRef.current = element; field.ref(element); }}
            onChange={(event) => { if (event.target.files?.[0]) onChange(event.target.files[0]); }}
            onBlur={field.onBlur}
            name={field.name}
            disabled={disabled}
            aria-label={label}
          />
          {value ? <div className="flex flex-col items-center relative w-full px-4">
            <p className="upload-dropzone-text line-clamp-1">{(value as File).name}</p>
            <button
              type="button"
              onClick={(event) => {
                event.stopPropagation();
                if (!disabled) { onChange(undefined); if (inputRef.current) inputRef.current.value = ""; }
              }}
              disabled={disabled}
              aria-label={`Remove ${label.toLowerCase()}`}
              className="upload-dropzone-remove mt-2"
            ><X className="w-5 h-5" /></button>
          </div> : <>
            <Icon className="upload-dropzone-icon" />
            <p className="upload-dropzone-text">{placeholder}</p>
            <p className="upload-dropzone-hint">{hint}</p>
          </>}
        </div>
      </FormControl>
      <FormMessage />
    </FormItem>
  );
}

export default function FileUploader<T extends FieldValues>(props: FileUploadFieldProps<T>) {
  return <FormField control={props.control} name={props.name} render={({ field }) => <UploadInput {...props} field={field} />} />;
}

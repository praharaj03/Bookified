"use client";

import Link from "next/link";
import { BookCardProps } from "@/types";
import Image from "next/image";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { Trash2 } from "lucide-react";
import { deleteBook } from "@/lib/actions/book.actions";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const BookCard = ({ id, title, author, coverURL, slug, isDemo = false, editing = false }: BookCardProps & { editing?: boolean }) => {
  const [deleting, setDeleting] = useState(false);
  const router = useRouter();
  const remove = async () => {
    if (deleting || !window.confirm(`Delete “${title}” and its uploaded files? This cannot be undone.`)) return;
    setDeleting(true);
    try {
      const result = await deleteBook(id);
      if (!result.success) throw new Error(result.error);
      if (result.warning) toast.warning(result.warning); else toast.success("Book deleted.");
      router.refresh();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Could not delete the book.");
    } finally { setDeleting(false); }
  };
  return (
    <div className="space-y-3">
    <Link href={`/books/${slug}`}>
      <article className="book-card">
        <figure className="book-card-figure">
          <div className="book-card-cover-wrapper">
            <Image
              src={coverURL || "/assets/book-cover.svg"}
              alt={title}
              width={133}
              height={200}
              className="book-card-cover"
            />
          </div>

          <figcaption className="book-card-meta">
            {isDemo && <span className="text-xs font-semibold uppercase tracking-wider text-[#663820]">Try a demo</span>}
            <h3 className="book-card-title">{title}</h3>
            <p className="book-card-author">{author}</p>
          </figcaption>
        </figure>
      </article>
    </Link>
    {editing && !isDemo && <Button variant="destructive" className="w-full" disabled={deleting} onClick={() => void remove()} aria-label={`Delete ${title}`}><Trash2 className="size-4" />{deleting ? "Deleting…" : "Delete book"}</Button>}
    </div>
  );
};
export default BookCard;

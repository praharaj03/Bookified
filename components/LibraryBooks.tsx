"use client";

import { useState } from "react";
import { Pencil, Check } from "lucide-react";
import BookCard from "@/components/BookCard";
import { Button } from "@/components/ui/button";
import type { BookCardProps } from "@/types";

export default function LibraryBooks({ books }: { books: BookCardProps[] }) {
  const [editing, setEditing] = useState(false);
  return <div className="space-y-5">
    {books.some((book) => !book.isDemo) && <div className="flex justify-end"><Button variant="outline" onClick={() => setEditing(!editing)} aria-pressed={editing}>{editing ? <Check className="size-4" /> : <Pencil className="size-4" />}{editing ? "Done editing" : "Edit library"}</Button></div>}
    <div className="library-books-grid">{books.map((book) => <BookCard key={book.id} {...book} editing={editing} />)}</div>
  </div>;
}

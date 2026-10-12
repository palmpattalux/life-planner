// Shown while a board opens: three dots, one after another.
export default function Loading() {
  return (
    <div data-loading className="fixed inset-0 flex items-center justify-center gap-2 bg-white">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="size-2.5 animate-bounce rounded-full bg-stone-400"
          style={{ animationDelay: `${i * 0.15}s` }}
        />
      ))}
    </div>
  );
}

import { EXPLORER_URL } from "@/config";
import { shortAccount } from "@/lib/near";

/** An account name, shortened, linking to it in the explorer. */
export function AccountLink({ id, keep }: { id: string; keep?: number }) {
  return (
    <a href={`${EXPLORER_URL}/address/${id}`} target="_blank" rel="noreferrer" className="font-mono hover:underline">
      {shortAccount(id, keep)}
    </a>
  );
}

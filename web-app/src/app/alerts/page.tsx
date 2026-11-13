import { redirect } from "next/navigation";

// Alerts live on the phone page now, under linking your phone. Old links land on that part.
export default function Alerts() {
  redirect("/texts#alerts");
}

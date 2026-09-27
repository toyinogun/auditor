import { redirect } from "next/navigation";

/** Until the landing page (Feature 13), the root opens the review screen (spec 0007, AC-10). */
export default function Home() {
  redirect("/review");
}

import { redirect } from "next/navigation";

export default function Home() {
  redirect("/prototype.html?entry=shelf&demo=ink&minimal=1");
}

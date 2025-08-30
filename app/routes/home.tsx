import { Welcome } from "../welcome/welcome";
import type { Route } from "./+types/home";

export function meta({}: Route.MetaArgs) {
  return [
    { title: "Kawal Indonesia 🇮🇩" },
    {
      name: "description",
      content: "Portal pelaporan publik berbasis lokasi & media",
    },
  ];
}

export default function Home() {
  return <Welcome />;
}

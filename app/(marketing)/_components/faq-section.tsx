import { Accordion } from "@/components/ui/accordion";
import { faqItems } from "../_lib/content";

export function FaqSection() {
  return (
    <div className="mx-auto max-w-3xl">
      <Accordion items={faqItems} />
    </div>
  );
}

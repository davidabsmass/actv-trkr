import GetStartedGuide from "@/components/onboarding/GetStartedGuide";
import FaqSection from "@/components/FaqSection";

export default function GetStarted() {
  return (
    <div className="space-y-10">
      <GetStartedGuide />
      <FaqSection variant="app" />
    </div>
  );
}

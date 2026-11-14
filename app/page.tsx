import App from "@/components/App";
import { ActionBar, Closing, Faq, Hero, Honest, Nav, Statement, Steps, VoiceBand } from "@/components/Landing";

/*
  type: software
  deal: hero triptych, nav-centre, close-type, footer-columns, rhythm dark-band, buttons solid, mark ring,
        ground sand, card ground grain-gradient (steps), palette blue-black-cornflower, type plex, radius round
  moments: liquid-type in #museums (the statement: the brief's own line, set large)
  plan: .taste-skill/plan.md
*/
export default function Page() {
  return (
    <>
      <Nav />
      <main id="top">
        <Hero />
        <App />
        <Steps />
        <VoiceBand />
        <Statement />
        <Honest />
        <Faq />
      </main>
      <Closing />
      <ActionBar />
    </>
  );
}

// The page around the live app, built from tasteskill's starter.html and recipes
// (.claude/skills/design-taste-frontend). Plan and deal: .taste-skill/plan.md.
// Every "Get a description" button carries data-describe: App.tsx takes the photo on that tap.

export const MAIN_ACTION = "Get a description";

function Arrow() {
  return (
    <svg className="m-arrow" viewBox="0 0 12 12" aria-hidden="true">
      <path className="m-arrow__stem" d="M1 6h8" />
      <path className="m-arrow__head" d="M4.5 2.5 8 6l-3.5 3.5" />
    </svg>
  );
}

function Logo() {
  return (
    <a className="nav__logo" href="#top">
      <span className="mark" data-mark="ring" aria-hidden="true"></span>Wildlife Described
    </a>
  );
}

const WAVE = [5, 9, 14, 8, 17, 11, 20, 13, 7, 16, 10, 6, 12, 18, 9, 5];

function Wave() {
  return (
    <span className="pc-wave" aria-hidden="true">
      {WAVE.map((h, i) => (
        <i key={i} style={{ ["--h" as string]: h }} />
      ))}
    </span>
  );
}

export function Nav() {
  return (
    <header className="nav nav--centre">
      <div className="wrap nav__bar">
        <a className="skip-link" href="#top">
          Skip to content
        </a>
        <Logo />
        <nav className="nav__links" aria-label="Main">
          <div className="nav__item">
            <a className="nav__link" href="#app">App</a>
          </div>
          <div className="nav__item">
            <a className="nav__link" href="#how">Steps</a>
          </div>
          <div className="nav__item">
            <a className="nav__link" href="#voice">Voice</a>
          </div>
          <div className="nav__item">
            <a className="nav__link" href="#faq">Questions</a>
          </div>
        </nav>
        <div className="nav__actions">
          <a className="btn btn--primary" href="#app" data-describe>
            {MAIN_ACTION}
          </a>
        </div>
        <button className="nav__toggle" type="button" aria-expanded="false" aria-label="Menu">
          <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
            <path d="M2 5h14M2 13h14" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
      </div>
    </header>
  );
}

const IMG = {
  trex: "/assets/img/photo-f16820650",
  giraffes: "/assets/img/photo-f20274483",
  trike: "/assets/img/photo-f12651633",
};

function Photo({ src, pos }: { src: string; pos: string }) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={`${src}-640.webp`}
      srcSet={`${src}-640.webp 640w, ${src}-1280.webp 1280w`}
      sizes="(max-width: 639px) 90vw, 30vw"
      width={640}
      height={427}
      alt=""
      style={{ objectPosition: pos }}
      data-source="stand-in"
      data-subject="stand-in"
    />
  );
}

export function Hero() {
  return (
    <section className="hero hero--triptych" data-enter aria-labelledby="hero-h">
      <div className="wrap">
        <div className="hero-text grid hero__grid">
          <div className="span-3">
            <h1 id="hero-h">Talking camera for blind visitors</h1>
            <p className="hero__lead">
              Point a phone at a dinosaur skeleton or a giraffe. Gemini says what it is, how big it is and how it
              stands, in under 20 seconds.
            </p>
          </div>
          <div
            className="ly-collage span-6 start-4"
            role="img"
            aria-label="A T. rex skeleton, a group of giraffes and a Triceratops skull, each with the description the app spoke for it"
          >
            <div className="ly-collage__set is-on">
              <div className="ly-piece" style={{ left: "4%", top: "6%", width: "64%", height: "56%" }}>
                <Photo src={IMG.trex} pos="50% 40%" />
              </div>
              <div className="ly-piece pc-result" style={{ left: "46%", top: "50%", width: "50%", height: "46%" }}>
                <span className="pc-label">Tyrannosaurus rex skeleton</span>
                <p>About as long as a school bus, hips higher than a doorway.</p>
                <span className="pc-chip pc-chip--ok">Sure</span>
              </div>
              <div className="ly-piece pc-say" style={{ left: "6%", top: "70%", width: "38%" }}>
                <Wave />
                <span>Speaking</span>
              </div>
            </div>
            <div className="ly-collage__set" aria-hidden="true">
              <div className="ly-piece" style={{ left: "34%", top: "4%", width: "62%", height: "60%" }}>
                <Photo src={IMG.giraffes} pos="50% 45%" />
              </div>
              <div className="ly-piece pc-ask" style={{ left: "4%", top: "14%", width: "40%" }}>
                <span className="pc-label">You asked</span>
                <p>How tall is it?</p>
              </div>
              <div className="ly-piece pc-result" style={{ left: "4%", top: "68%", width: "92%", height: "28%" }}>
                <span className="pc-label">Giraffe</span>
                <p>It is taller than a basketball hoop, and most of that height is its neck.</p>
              </div>
            </div>
            <div className="ly-collage__set" aria-hidden="true">
              <div className="ly-piece" style={{ left: "4%", top: "6%", width: "70%", height: "58%" }}>
                <Photo src={IMG.trike} pos="45% 50%" />
              </div>
              <div className="ly-piece pc-result pc-result--caveat" style={{ left: "38%", top: "54%", width: "58%", height: "42%" }}>
                <span className="pc-chip pc-chip--warn">Not certain</span>
                <p>I'm not certain, but this looks like a Triceratops skull, with a bony frill like a fan.</p>
              </div>
              <div className="ly-piece pc-say" style={{ left: "4%", top: "72%", width: "32%" }}>
                <Wave />
                <span>Speaking</span>
              </div>
            </div>
          </div>
          <div className="span-3 start-10 hero__cta">
            <a className="btn btn--primary" href="#app" data-describe>
              {MAIN_ACTION}
              <Arrow />
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Steps() {
  return (
    <section className="section" id="how" aria-labelledby="how-h" style={{ ["--hm" as string]: 2 }}>
      <div className="wrap">
        <div className="section-head">
          <h2 id="how-h">A description in 3 steps</h2>
        </div>
        <div className="grid">
          <article className="card card--row card--open span-4 m-nolift">
            <span className="step-num">1</span>
            <h3>Takes one photo</h3>
            <p>The camera turns on for about a second, then off again.</p>
            <div className="panel" data-fx="grain-gradient" data-fx-seed="11">
              <div className="stage stage--fade-b">
                <div className="at-rise fit" style={{ ["--fit-max" as string]: "264px", ["--ax" as string]: "max(24px, 50% - 132px)", ["--ay" as string]: "40px" }}>
                  <div className="ui ui-panel pc-finder" aria-hidden="true">
                    <span className="pc-finder__corners" />
                    <span className="pc-finder__shutter" />
                    <span className="pc-finder__text">Photo taken. Camera off.</span>
                  </div>
                </div>
              </div>
            </div>
          </article>
          <article className="card card--row card--open span-4 m-nolift">
            <span className="step-num">2</span>
            <h3>Gemini names the exhibit</h3>
            <p>Subject, size, posture and how sure it is, in one answer.</p>
            <div className="panel" data-fx="grain-gradient" data-fx-seed="23">
              <div className="stage stage--fade-b">
                <div className="at-rise to-edge" style={{ ["--w" as string]: "320px", ["--ax" as string]: "max(24px, 50% - 160px)", ["--ay" as string]: "40px" }}>
                  <div className="ui ui-panel ui-code" data-ui="code" aria-hidden="true">
                    <div className="ui-code__tabs">
                      <span className="ui-code__tab is-on">
                        <i className="ui-code__lang">JSON</i>describe
                      </span>
                      <span className="ui-spacer" />
                      <span className="ui-chip ui-chip--plain ui-code__chip">200</span>
                    </div>
                    <pre className="ui-code__pre">
                      <code>
                        <span className="ui-code__ln" data-n="1">{"{"}</span>
                        {"\n"}
                        <span className="ui-code__ln" data-n="2">
                          {"  "}<span className="k">&quot;subject&quot;</span>: <span className="f">&quot;Giraffe&quot;</span>,
                        </span>
                        {"\n"}
                        <span className="ui-code__ln is-mark" data-n="3">
                          {"  "}<span className="k">&quot;confidence&quot;</span>: <span className="f">&quot;high&quot;</span>,
                        </span>
                        {"\n"}
                        <span className="ui-code__ln" data-n="4">
                          {"  "}<span className="k">&quot;size&quot;</span>: <span className="f">&quot;taller than a hoop&quot;</span>,
                        </span>
                        {"\n"}
                        <span className="ui-code__ln" data-n="5">
                          {"  "}<span className="k">&quot;caveats&quot;</span>: <span className="f">&quot;&quot;</span>
                        </span>
                        {"\n"}
                        <span className="ui-code__ln" data-n="6">{"}"}</span>
                      </code>
                    </pre>
                  </div>
                </div>
              </div>
            </div>
          </article>
          <article className="card card--row card--open span-4 m-nolift">
            <span className="step-num">3</span>
            <h3>Reads the description aloud</h3>
            <p>Google Cloud Text-to-Speech, with your phone’s own voice as the backup.</p>
            <div className="panel" data-fx="grain-gradient" data-fx-seed="37">
              <div className="stage stage--fade-b">
                <div
                  className="at-rise to-edge fit"
                  style={{ ["--fit-max" as string]: "264px", ["--ax" as string]: "max(24px, 50% - 132px)", ["--ay" as string]: "32px" }}
                  data-ui-loop
                >
                  <div className="ui ui-panel ui-voice" data-ui="voice" aria-hidden="true">
                    <div className="ui-voice__top">
                      <span className="ui-chip ui-chip--ink">Speaking</span>
                      <span className="ui-spacer" />
                      <span className="ui-voice__time" data-voice-time>00:04</span>
                    </div>
                    <div className="ui-voice__orb" data-voice-orb />
                    <div className="ui-voice__who">
                      <span className="ui-voice__name">Wildlife Described</span>
                      <span className="ui-voice__with">T. rex skeleton</span>
                    </div>
                    <div className="ui-voice__cap" data-voice-cap>
                      It stands mid-stride, its long tail held out behind for balance.
                    </div>
                    <div className="ui-voice__bar">
                      <span className="ui-voice__wave" aria-hidden="true">
                        {[4, 7, 12, 9, 16, 11, 20, 14, 8, 17, 12, 6, 10, 18, 13, 7, 15, 9, 5, 11, 7, 4].map((h, i) => (
                          <i key={i} style={{ ["--h" as string]: h }} />
                        ))}
                      </span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

export function VoiceBand() {
  return (
    <section className="section ground-inverse" id="voice" aria-labelledby="voice-h">
      <div className="wrap">
        <div className="grid">
          <div className="span-5 stack-6">
            <h2 id="voice-h">Works with the screen turned away</h2>
            <p className="t-lead">
              Every control has a spoken name for VoiceOver and TalkBack. Sounds mark the photo, the answer and any
              error.
            </p>
            <ul className="pc-facts">
              <li>Say “describe”, “more”, “repeat” or “stop”</li>
              <li>Ask any question about the last photo</li>
              <li>Press D, A, R, M or S on a keyboard</li>
            </ul>
            <a className="link" href="#app">
              Try the voice commands
            </a>
          </div>
          <div className="frame frame--split frame--lit span-6 start-7">
            <div className="stage stage--fade-b">
              <div
                className="at-rise to-edge fit"
                style={{ ["--fit-max" as string]: "400px", ["--ax" as string]: "max(24px, 50% - 200px)", ["--ay" as string]: "48px" }}
              >
                <div className="ui ui-panel ui-chat" data-ui="chat" aria-hidden="true">
                  <div className="ui-head">
                    <span className="ui-agent" aria-hidden="true" />
                    <div className="ui-title">Wildlife Described</div>
                    <span className="ui-chat__online">Listening</span>
                    <span className="ui-spacer" />
                  </div>
                  <div className="ui-chat__body">
                    <div className="ui-msg ui-msg--me" data-chat-q>
                      <span className="ui-msg__text">How big were its teeth?</span>
                    </div>
                    <div className="ui-msg ui-msg--bot" data-chat-a>
                      <span className="ui-agent ui-msg__av" aria-hidden="true" />
                      <span className="ui-msg__col">
                        <span className="ui-chat__answer">
                          About the size of a <b>banana</b>, root included. The longest were near the front of the jaw.
                        </span>
                        <span className="ui-chat__srcs">
                          <span className="ui-chat__src">From your last photo</span>
                        </span>
                      </span>
                    </div>
                    <div className="ui-msg ui-msg--me">
                      <span className="ui-msg__text">Repeat</span>
                    </div>
                  </div>
                  <div className="ui-chat__input">
                    <span className="ui-chat__ph">Say a question</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

export function Statement() {
  return (
    <section className="section statement" id="museums" aria-label="Why it exists">
      <div className="wrap">
        <div data-moment="liquid-type" className="section-head" style={{ maxWidth: "none" }}>
          <p className="mo-lt__type">Museums are built to be looked at</p>
          <p className="t-lead">
            Wildlife Described lets blind and low-vision visitors hear an exhibit, then ask about it.
          </p>
        </div>
      </div>
    </section>
  );
}

export function Honest() {
  return (
    <section className="section" id="honest" aria-labelledby="honest-h" style={{ ["--hm" as string]: 2 }}>
      <div className="wrap">
        <div className="section-head">
          <h2 id="honest-h">
            Says how sure it is. <span className="muted">Gemini can be wrong about a fossil or an animal.</span>
          </h2>
        </div>
        <div className="grid">
          <article className="card card--row card--open span-6 m-nolift">
            <h3>Warns you about doubtful answers</h3>
            <p>A doubtful answer starts with “I’m not certain”, so you know to ask a guide.</p>
            <div className="panel frame--lit">
              <div className="stage stage--fade-b">
                <div className="at-rise fit" style={{ ["--fit-max" as string]: "420px", ["--ax" as string]: "max(24px, 50% - 210px)", ["--ay" as string]: "48px" }}>
                  <div className="ui ui-panel pc-answer" aria-hidden="true">
                    <span className="pc-chip pc-chip--warn">Not certain</span>
                    <span className="pc-answer__subject">Triceratops skull, possibly a cast</span>
                    <p>I’m not certain, but this looks like a Triceratops skull on a low plinth.</p>
                    <p className="pc-answer__muted">Two long horns above the eyes, a short one on the nose.</p>
                  </div>
                </div>
              </div>
            </div>
          </article>
          <article className="card card--row card--open span-6 m-nolift">
            <h3>Gives exhibit sizes you can picture</h3>
            <p>Lengths become school buses, doorways and sofas, never bare numbers.</p>
            <div className="panel frame--lit">
              <div className="stage stage--fade-b">
                <div className="at-rise fit" style={{ ["--fit-max" as string]: "420px", ["--ax" as string]: "max(24px, 50% - 210px)", ["--ay" as string]: "48px" }}>
                  <div className="ui ui-panel pc-answer" aria-hidden="true">
                    <span className="pc-chip pc-chip--ok">Sure</span>
                    <span className="pc-answer__subject">Giraffe</span>
                    <p>It is taller than a basketball hoop, reaching up to eat leaves.</p>
                    <p className="pc-answer__muted">Its tongue is about as long as your forearm.</p>
                  </div>
                </div>
              </div>
            </div>
          </article>
        </div>
      </div>
    </section>
  );
}

const FAQ: [string, string][] = [
  ["Do visitors need to install anything?", "No. It runs in the browser on iPhone and Android. You can add it to your home screen."],
  ["Is the camera on for the whole museum visit?", "No. It turns on to take one photo and turns off straight after, every time."],
  ["What if it names the wrong exhibit?", "It can. When Gemini is not sure, the answer starts with “I’m not certain”, so you know to check."],
  ["Will it say if a zoo animal is safe to approach?", "No. It describes what it sees and never gives safety advice. Follow the signs and the staff."],
  ["Do descriptions work with VoiceOver and TalkBack?", "Yes. Turn App voice off and your screen reader reads every answer instead."],
  ["Which languages do descriptions come in?", "English for now."],
];

export function Faq() {
  return (
    <section className="section" id="faq" aria-labelledby="faq-h" style={{ ["--hm" as string]: 2 }}>
      <div className="wrap">
        <div className="grid">
          <div className="span-5 stack-6">
            <h2 id="faq-h">Questions</h2>
            <p className="muted">What visitors and museum staff ask first.</p>
            <a className="link" href="mailto:hello@wildlife-described.example">
              Email the team
            </a>
          </div>
          <div className="faq span-6 start-7">
            {FAQ.map(([q, a]) => (
              <div className="faq__item" key={q}>
                <h3>{q}</h3>
                <p>{a}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export function Closing() {
  return (
    <footer className="footer closing" id="contact" aria-labelledby="close-h">
      <div className="wrap">
        <div className="closing__cta close--type">
          <div className="section-head">
            <h2 id="close-h">Describe the next exhibit</h2>
            <p className="t-small muted">Runs in your phone’s browser. Nothing to install.</p>
          </div>
          <a className="btn btn--primary btn--xl btn--wide" href="#app" data-describe>
            {MAIN_ACTION}
            <Arrow />
          </a>
        </div>
        <div className="closing__links">
          <div className="grid">
            <div className="span-4 stack-4">
              <Logo />
              <p className="footer__lede">Spoken descriptions of exhibits and animals</p>
            </div>
            <div className="span-2 footer__col">
              <h3>App</h3>
              <ul>
                <li><a href="#app">The app</a></li>
                <li><a href="#honest">Accuracy</a></li>
              </ul>
            </div>
            <div className="span-2 footer__col">
              <h3>Steps</h3>
              <ul>
                <li><a href="#how">How it works</a></li>
                <li><a href="#museums">Why it exists</a></li>
              </ul>
            </div>
            <div className="span-2 footer__col">
              <h3>Voice</h3>
              <ul>
                <li><a href="#voice">Voice commands</a></li>
              </ul>
            </div>
            <div className="span-2 footer__col">
              <h3>Questions</h3>
              <ul>
                <li><a href="#faq">Questions</a></li>
                <li><a href="#contact">Contact</a></li>
              </ul>
            </div>
          </div>
          <div className="footer__legal">
            <span>&copy; 2026 Wildlife Described</span>
            <div className="socials" />
            <details className="credits">
              <summary>Photographs via Wikimedia Commons</summary>
              <ul>
                <li>Tyrannosaurus rex skeleton, cast of MOR 555: Robosorne, CC BY-SA 3.0</li>
                <li>Giraffes, Copenhagen Zoo: Daderot, CC0</li>
                <li>Triceratops skull, Houston: Nekarius, public domain</li>
              </ul>
            </details>
          </div>
        </div>
      </div>
    </footer>
  );
}

/** The phone's action bar (system.md, Nav): system.js shows it once the hero's button has scrolled away. */
export function ActionBar() {
  return (
    <nav className="actionbar" aria-label="Quick actions">
      <a className="btn btn--primary" href="#app" data-describe>
        {MAIN_ACTION}
      </a>
    </nav>
  );
}

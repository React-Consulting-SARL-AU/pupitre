import type { HomeContent } from "./home"

export const homeEn: HomeContent = {
  meta: {
    title: "Pupitre — a machine for your AI agents",
    description:
      "A Mac, Windows and Linux app that sets up a rented server — a VPS — for you and installs your tools, your databases and your AI agents on it. Without a single command line.",
  },
  hero: {
    eyebrow: "For Mac, Windows and Linux",
    headline:
      "Your AI agents get a machine of their own. Your laptop cools down.",
    lead: "Rent a server that stays on day and night, and let Pupitre set it up for you. Your tools, your databases and your agents install themselves, and you watch it all from an app on your desk.",
    signUp: "Create an account",
    download: "Download the app",
    note: "Not one command to type: you tick the boxes, Pupitre installs, you watch it work.",
  },
  stack: {
    title: "All of this, installed for you",
    lead: "You tick what you need. Pupitre takes care of the versions, the settings and the updates.",
    note: "And a score of others, to add or remove whenever you like.",
    link: "See everything it installs",
  },
  name: {
    label: "The name",
    word: "pupitre",
    pronunciation: "py.pitʁ",
    grammar: "French, masculine noun",
    senses: [
      "The school desk. The sloping wooden lid you lifted to find your books, two to a bench, at the back of a classroom.",
      "By extension, the stand a conductor reads from, and the console an engineer sits at.",
    ],
    note: "We gave one to your agents. Yours is the laptop you have just closed.",
  },
  steps: {
    label: "How it works",
    title: "Six steps, and you only walk them once",
    lead: "Half an hour at most, and most of that is spent watching the app do the work.",
    items: [
      {
        title: "You are here",
        detail:
          "This site says what Pupitre installs, what it leaves on your machine and what it costs. Read the catalogue and the pricing before anything else.",
      },
      {
        title: "Create your account",
        detail:
          "An email address is enough. The account holds your organisation, your invoices and the servers you attach to it.",
      },
      {
        title: "Start your trial",
        detail:
          "{days} days, and no card is asked for. The trial opens the whole catalogue and everything the app knows how to do.",
      },
      {
        title: "Download the app",
        detail:
          "Mac, Windows or Linux. It is the only thing that gets installed on your own computer.",
      },
      {
        title: "Link the app to your account",
        detail:
          "The app shows a code, you confirm it in your account, and the two know each other from then on.",
      },
      {
        title: "Let it set up your server",
        detail:
          "Rent a machine at the host of your choice, give the app its address, tick what you want, and watch it work.",
      },
    ],
  },
  features: {
    label: "What changes",
    title: "A working machine that asks nothing of you",
    items: [
      {
        title: "Your laptop gets a break",
        lines: [
          "The agents, the projects and the databases run on the server, not on your laptop.",
          "You close the lid: everything keeps going over there, and it is all still running when you open it again.",
        ],
      },
      {
        title: "Nothing to configure",
        lines: [
          "No command to paste, no file to edit, no tutorial to follow to the end.",
          "Every wait says what is happening, and when something fails the app shows the button that repairs it.",
        ],
      },
      {
        title: "Your accounts stay yours",
        lines: [
          "Claude Code and Codex are installed on the server and sign in to your own subscriptions.",
          "Nothing passes through us: your code and your conversations stay between you and your server.",
        ],
      },
    ],
  },
  clients: {
    label: "Your tools",
    title: "Work from the app you already love",
    lead: "Pupitre forces nothing on you. Its window is there to install, watch over and repair; to write code, you keep your habits.",
    items: [
      {
        title: "Claude",
        lines: [
          "Add your server in the Claude app, and Claude Code works over there, in your projects.",
          "It finds the project's instructions and tools, already placed on the server by Pupitre.",
        ],
      },
      {
        title: "ChatGPT and Codex",
        lines: [
          "The same from the ChatGPT app: Codex runs on the server, on your subscription.",
          "Both agents live side by side and see the same projects, the same tools, the same databases.",
        ],
      },
      {
        title: "Your code editor",
        lines: [
          "VS Code, Cursor, Zed and the JetBrains editors all know how to open a folder on a remote machine.",
          "Point yours at the server and you write as usual, with your extensions and your shortcuts.",
        ],
      },
    ],
    note: "You connect each tool once. After that, the Pupitre app is where the install, the services and the alerts live — not a window you are made to work in.",
  },
  catalog: {
    label: "Catalogue",
    title: "What Pupitre knows how to install",
    lead: "A library of the tools people actually use, chosen because they install and stay up to date cleanly. What is not here, you can install yourself: the machine is yours.",
  },
  promise: {
    label: "The promise",
    title: "Four things you can check",
    items: [
      {
        statement: "Nobody can get in.",
        proof:
          "Your server accepts no connection coming from us. Your computer is the one that talks to it, never the other way round — not even our support, which cannot connect to it.",
      },
      {
        statement: "Your keys never leave your computer.",
        proof:
          "Pupitre makes the key that opens the server on your computer. It stays with you, and we hold no copy of it.",
      },
      {
        statement: "The machine stays yours.",
        proof:
          "You keep full rights on it. Install what you want, including what Pupitre does not offer, host what you want on it, log in to it without going through the app. Pupitre looks after what it put there itself, and nothing else.",
      },
      {
        statement: "You keep everything if you leave.",
        proof:
          "Stop the subscription and the server keeps running, with your projects, your databases and your data. You lose the app, nothing else. It is written in the terms.",
      },
    ],
  },
  faq: {
    label: "Questions",
    title: "Honest answers",
    items: [
      {
        question: "I have never rented a server. Is this for me?",
        answer:
          "Yes, and that is exactly why Pupitre exists. A server — a VPS, in the jargon — is simply a computer you rent from a host and that stays on all the time. You order it in three clicks, you get an address and a password by email, and you copy them into Pupitre. From there the app does the rest and explains what it is doing.",
      },
      {
        question: "What do I need to know how to do?",
        answer:
          "Nothing in particular. If you can install an application on your computer, you can use Pupitre. The app never asks you to type a command: it asks its questions in plain words, ticks the boxes for you when the answer is obvious, and when something goes wrong it shows the button that repairs it rather than an error message.",
      },
      {
        question: "What does it cost in total?",
        answer:
          "Two things: renting the server, which you pay to your host — count five to ten euros a month to start — and the Pupitre subscription. Your Claude or ChatGPT subscriptions stay yours and do not change. Nothing is billed by usage: no surprise at the end of the month.",
      },
      {
        question: "Does my code stay private?",
        answer:
          "Your code, your data and your conversations with the agents live on your server and do not leave it. We do not see them, we keep no copy of them and nothing passes through our servers. We only know that a server is attached to your account and which version it runs, so we can tell you when an update is waiting for it.",
      },
      {
        question: "Is the server only good for Pupitre?",
        answer:
          "No, it is yours and you do what you like with it. It is an ordinary Ubuntu server and you are its administrator: you can host a site on it, run a service of your own, install tools that are not in the catalogue, or log in to it directly without opening the app. Pupitre installs and watches over what it put there, and touches nothing else: its work stops at setting up your remote development environment and keeping it up to date.",
      },
      {
        question: "What if I want to stop?",
        answer:
          "You uninstall the app. The server stays yours and keeps running exactly the same: your projects, your databases and your tools are all still there, set up with standard tools any developer can pick up. Pupitre locks nothing in and locks nothing down.",
      },
      {
        question: "Does it work on my computer?",
        answer:
          "The app runs on Mac, on Windows 11 and on Ubuntu. The server you rent always runs Ubuntu: that is the system Pupitre knows how to set up, and the app checks that it is suitable before touching it. If it is not, it tells you before you have paid for anything.",
      },
    ],
  },
  pricing: {
    label: "Pricing",
    title: "One price per server",
    perServer:
      "{price} per server per month, excluding tax, on {solo} as on {team}.",
    annual: "Yearly, {months} months are free: {yearly} per server per year.",
    trial: "{days}-day trial, no card.",
    hosted:
      "{hosted}, a server provided by Pupitre, from {price} per month. Later.",
    link: "See the pricing",
  },
  cta: {
    title: "Give your agents a machine.",
    lead: "Create your account, start the trial, then download the app and point it at the server you have just rented. Nothing else is installed on your computer but the app itself.",
    signUp: "Create an account",
    docs: "Read the docs",
  },
}

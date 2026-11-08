<div align="center">

# URL Manager

### A home for every link worth keeping.

**Built for one person. Designed like a product.**

[**Live demo**](https://url-manager-yugbangoriya.vercel.app) &nbsp;·&nbsp; [**First version**](https://yugbangoriya.github.io/URL-Manager/url-manager.html) &nbsp;·&nbsp; [**Wiki**](https://github.com/YugBangoriya/URL-Manager/wiki)

![Live](https://img.shields.io/badge/Live-Vercel-b7410e?style=flat-square&logo=vercel&logoColor=white)
![Supabase](https://img.shields.io/badge/Supabase-Postgres%20%2B%20Auth-b7410e?style=flat-square&logo=supabase&logoColor=white)
![Vite](https://img.shields.io/badge/Vite-5-b7410e?style=flat-square&logo=vite&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-Vanilla-b7410e?style=flat-square&logo=javascript&logoColor=white)
![Cost](https://img.shields.io/badge/Running%20cost-%E2%82%B90-b7410e?style=flat-square)

</div>

---

<div align="center">
  
## Preview

<img width="1080" alt="URL Manager Preview" src="https://github.com/user-attachments/assets/6ba2eaff-a586-437a-9d9b-8dc31275e779" />

</div>

---

## The problem

Links pile up faster than I can organise them. Websites for college, references for business, interfaces I liked, project ideas I couldn't build yet, Instagram reels I saved and never opened again. Over time they scattered across browser bookmarks, Notion pages, Google Drive folders and Instagram's saved tab: four places, with four different ideas of how a link should be stored.

Each of those tools can hold a link. None of them is built around the thing I actually do, which is drop a link somewhere in a few seconds and find it again in a few seconds. Notion and Drive are built for something bigger, so every save costs more clicks than a link deserves. What I wanted was closer to the URL manager inside Opera GX: folders, links, and nothing in the way.

So I built it. For one user, me, with no plan to turn it into a product. That constraint turned out to be useful. With exactly one person to answer to, every decision had a clear test.

## What it is

URL Manager organises links in three levels. **Sheets** run along the bottom of the screen like the tabs in Google Sheets. Each sheet holds **folders** that collapse and expand. Each folder holds **links** with three optional fields: name, URL and description. Nothing is required, so saving a link is never blocked by a form.

- Edit anything in place: click a cell, type, press Enter. No popups.
- Copy any URL with one click, or open it in a new tab.
- Search every sheet, folder and link at once. Picking a result jumps to the link and highlights it.
- Drag to reorder sheets, folders and links.
- Every sheet shows when it was last edited, so it's easy to tell whether a backup is out of date.
- Dark by default, with a light mode. Works on a phone.
- Export everything as a JSON backup, and import it back whenever you need to.

## It started as one HTML file

The first version had three rules: it had to cost ₹0, it had to have no backend, and it had to run by simply opening a file in a browser. The data lived in the browser's local storage, and GitHub Pages hosted it for free.

It came together in about a week, in five stages (shell and sheets, folders and links, search, export and light mode, polish and mobile). Each stage became its own commit, so the history of this repository is also the build log.

A few small decisions from that version are still the ones I care about most:

- **Tabs sit at the bottom**, like a spreadsheet, because that's where my hands already expect them.
- **Editing is inline**, because a popup turns "copy a link quickly" into three clicks.
- **Every sheet carries a last-edited date**, so I can tell at a glance whether my Google Drive backup still matches the app.
- **Deleting asks for confirmation, and the confirm button never appears where the trash icon was.** A double-click can't delete anything.

It did exactly what I had asked it to do. Which is when I started noticing what I hadn't asked for.

## Where one file stopped being enough

A browser's local storage belongs to one browser on one device. My laptop and my phone were two separate libraries. Worse, the same app opened from a file on my laptop and from the GitHub Pages link counted as two more, because each address keeps its own storage.

Export and import bridge that gap, but only by hand. I wanted to open the app on my phone and find my links already there.

Automatic sync needs something in the middle, so the real question was which something. I weighed four options:

| Option | What decided it |
|---|---|
| Keep manual export and import | Free and simple, but it was the problem, not the answer |
| Store the data as a file in GitHub through its API | Free, but needs an access token sitting in the browser |
| Firebase / Firestore | I had used it before and knew the free tier asks for billing details |
| **Supabase** | Free plan, no card, a real PostgreSQL database, logins built in |

Supabase won. There were two reasons to move, and I'd rather be upfront about both. The practical one: I want the same links on every device without thinking about it. The other: I wanted this project to be more than a clever file. I wanted to work through the decisions real products have to make about data, logins, permissions and deployment.

## The second version: same product, real foundation

| | First version | Current version |
|---|---|---|
| Where the data lives | Browser local storage | Supabase (PostgreSQL) |
| Devices | One browser at a time; move data by hand | Every device, automatically |
| Who can see it | Whoever opens their own copy | Public sheets: anyone. Everything else: only me |
| Who can change it | Anyone, on their own copy | Only me, after logging in |
| Hosting | GitHub Pages | Vercel |
| Build | None. One file | Vite, vanilla JavaScript, no framework |
| Running cost | ₹0 | ₹0 |

Two design decisions shaped it.

**One address, two modes.** There is no separate demo page. Anyone who opens the link without logging in lands in *viewer mode*: read-only, a banner across the top, and only the sheets I've marked public (the globe icon on a tab). When I log in, the same page becomes the full manager with every sheet. Same interface, different permissions.

**The page can lie; the database can't.** In viewer mode the edit buttons aren't just disabled, they're absent. But hiding buttons proves nothing, because anyone can open the browser's developer tools and call the API directly. The real lock sits in the database. Row Level Security policies in PostgreSQL decide what every request may read or write, so private rows are never returned to a visitor and a visitor's write is never accepted, whatever the page does. The only things visible in the page's source are the project address and a public key that is safe to expose by design. The powerful admin key never goes near the frontend.

The look didn't change: the same palette (`#020101` and rust `#b7410e`) and the same fonts (Syne, DM Mono, DM Sans). The product is the same. The foundation is what moved.

The full reasoning, data model and an honest list of trade-offs are in [Architecture and Security](https://github.com/YugBangoriya/URL-Manager/wiki/2.-Architecture-and-Security).

## How it was built

I didn't write this code line by line, and I won't pretend otherwise. AI wrote it; I directed it. What I wanted to find out was whether the quality of the result depends on the quality of the instructions. In this project it did, every time.

The method was simple, and I kept to it. Before any code, a product document: what this is, why it exists, the design system, the data model, every decision already made. Then a task list that cut the build into stages small enough to finish in one sitting. Each stage got a fresh chat that began with those documents, and ended with a written summary of what was built, what was confirmed working and what was still open. That summary became the first thing the next chat read. The AI was told to ask questions instead of guessing, and to stop at the end of each stage instead of running ahead.

When the project changed direction, the same method absorbed it: update the product document and task list first, then build. The move to Supabase went through exactly that.

The templates are in [The Method](https://github.com/YugBangoriya/URL-Manager/wiki/4.-The-Method), and the whole story in order is in [The Build Chronicle](https://github.com/YugBangoriya/URL-Manager/wiki/1.-The-Build-Chronicle).

## Try it

- **[Live app](https://url-manager-yugbangoriya.vercel.app)**: you land in viewer mode. Look around, search, copy a link. You can't edit anything, and that's the point.
- **[First version](https://yugbangoriya.github.io/URL-Manager/url-manager.html)**: runs entirely in your own browser. Whatever you add stays on your device and nobody else's copy shares it.

## Build your own

You can run your own copy for ₹0. Nothing in the process asks you to write code, only to copy, paste and click.

1. Fork this repository.
2. Create a free Supabase project and run `supabase-schema.sql` in its SQL editor.
3. Create your one user account in the Supabase dashboard, then switch off new sign-ups.
4. Copy `app/.env.example` to `app/.env` and paste in your project URL and anon key.
5. Run it locally with `npm install`, then `npm run dev`.
6. Deploy to Vercel with the root directory set to `app`, adding the same two values as environment variables.

The complete walkthrough, including a table of everything that went wrong for me and how I fixed it, is in [Build Your Own](https://github.com/YugBangoriya/URL-Manager/wiki/3.-Build-Your-Own). If you'd rather use the same method to build a different personal tool, start with [The Method](https://github.com/YugBangoriya/URL-Manager/wiki/4.-The-Method).

## Things worth knowing

- **Free Supabase projects pause after about a week of low activity.** If the live demo ever shows an error, that's the likely reason. One click in the Supabase dashboard brings it back with its data.
- **The free plan has no automatic backups.** That's why Export exists. It saves everything as a JSON file, and Import can bring it back. Import only ever adds: the file arrives as new private sheets at the end of your tabs, and nothing already in your library is replaced or deleted.
- **Public means public.** Anything in a public sheet can be read by anyone with the link. Private sheets stay private.
- **It is single-owner by design.** If you run your own copy, you are its only user.

## What I left out on purpose

Multiple users and teams, real-time collaboration, nested folders, tags, link previews and favicons, undo and redo, a custom domain. Each is a reasonable feature. Each is also a bigger product than the one I set out to build.

## Repository

```
URL-Manager/
├── url-manager.html        First version: the single-file app (still works)
├── supabase-schema.sql     Tables, security policies, indexes. Run once in Supabase
├── app/                    Current version (Vite + vanilla JavaScript)
│   ├── index.html
│   ├── package.json
│   ├── vite.config.js
│   ├── vercel.json
│   ├── .env.example        The two values you fill in
│   └── src/
│       ├── supabase.js     Connects to Supabase
│       ├── auth.js         Login, logout, session
│       ├── db.js           Every database operation
│       ├── main.js         App logic and rendering
│       └── style.css       Design system
├── README.md
└── LICENSE
```

## Documentation

The [wiki](https://github.com/YugBangoriya/URL-Manager/wiki) holds the detail this page leaves out.

| Page | What's in it |
|---|---|
| [1. The Build Chronicle](https://github.com/YugBangoriya/URL-Manager/wiki/1.-The-Build-Chronicle) | The full story in order: the brief, the build, the questions that changed direction, the migration |
| [2. Architecture and Security](https://github.com/YugBangoriya/URL-Manager/wiki/2.-Architecture-and-Security) | How it works, the data model, what each security layer protects against, and the honest gaps |
| [3. Build Your Own](https://github.com/YugBangoriya/URL-Manager/wiki/3.-Build-Your-Own) | Step-by-step setup for your own copy, with troubleshooting |
| [4. The Method](https://github.com/YugBangoriya/URL-Manager/wiki/4.-The-Method) | The AI-directed workflow, with reusable templates |

## About the builder

Built by **Yug Bangoriya**, a BSc Computer Science student with a minor in Entrepreneurship at Ahmedabad University. This is a personal project. The other project I'd point to is [SGA-Software](https://github.com/YugBangoriya/SGA-Software), a business management system built for a real CNG fitment centre in Rajkot ([wiki](https://github.com/YugBangoriya/SGA-Software/wiki)).

[LinkedIn](https://www.linkedin.com/in/yugbangoriya) &nbsp;·&nbsp; [Medium](https://medium.com/@yugbangoriya)

---

*Built by Yug Bangoriya · 2026 · See [LICENSE](LICENSE)*

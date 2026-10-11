# Life Planner

A huge white board, like Miro, with faint grey dots and a light grey line at its edge. Log in from any device.

**Home** lists everything you've saved. **New board** makes a white board and **New note** makes a note. Boards and notes save by themselves as you work (the top left says Saved). On a board, the top left has **Home** to go back and the board's name, which you can type over. A note has a title, a space to write, and **+ Add page** to make pages inside it.

- Two-finger swipe on the trackpad moves around the board.
- Pinch on the trackpad, or the mouse scroll wheel, zooms in and out.
- Press **b** to add a circle at the cursor. It is selected straight away with its menu open.
- Hold **n** to start a line at the cursor, move the mouse, and let go of **n** to confirm it. A line that starts or ends inside a circle or text is attached to it.
- Lines snap exactly level or upright when they are within a few degrees of horizontal or vertical (while drawing, dragging an end or dragging a bend).
- Click a line to show a dot on each end; drag a dot to move that end. Drag the middle of a line to move the whole line.
- Click a line and choose **Time**, then Day, Week, Month or Year. The line becomes a timeline, like a ruler.
  - **Day** (0–31), **Week** (1–4) and **Year**: two slots, Beginning → End. Type a number or scroll over a slot to count up or down. Enter moves from Beginning to End, and Enter again finishes.
  - **Month**: pick the beginning month (Jan–Dec), then the end month. It can wrap round the year, e.g. Nov → Feb.
- Click a timeline and a **Phase** box appears above the first third of it. Press Phase, move along the timeline (the stretch shows in orange), click to set the start, then click again or press Enter to finish (Escape cancels). The stretch becomes its own timeline beside the original (on the right of an upright timeline, above a level one), no longer connected to it.
- Between Phase and Pin are colour dots that recolour the timeline (line, marks, labels and arrowheads).
- The same box has **Pin** (pin icon): press it, move along the timeline and click a mark. That mark becomes bigger and bold, and a small box opens with **B** (turn bold off or on) and colours. Click a pinned mark to open its box again.
- Click a line to show an arrow button beside each end. Click one to give that end an arrowhead; click again to remove it.
- Click a line and choose **Text** to type text in the middle of the line. Double-click that text to edit it.
- Click a line and choose **Angle** to add a bend point (a small diamond). Drag it to bend the line. Choose Angle again for more bends: the new one goes in the middle of the part of the line you clicked on (between the nearest bend and that tip).
- Click anything and press **Backspace** to delete it.
- **Ctrl+Z** (or Cmd+Z) undoes any change: adding, moving, resizing, recolouring, arrows, bends, deleting. **Ctrl+Shift+Z** (or Cmd+Shift+Z) redoes it.
- Drag on an empty part of the board to draw a selection box. Everything it touches is selected: drag any of them, or anywhere inside the dashed box, to move them all. Pinch (or mouse wheel) with the cursor inside the box resizes them all; a two-finger swipe, or anything outside the box, moves around the board as usual.
- With several things selected, click **Group** beside the selection box. Grouped things are selected and moved together; click **Ungroup** to split them again.
- With several things selected, the **Save preset** button in the top right saves them as a preset (Preset 1, Preset 2, ...). Presets belong to you, so they can be used on any board.
- Press **v** to open the menu on the right (press **v** again to close it). Its **Preset** button drops down every saved preset with **Use** (places a copy in the middle of the screen), **Edit** (places it, and the top right button becomes **Update preset**: select what the preset should be and press it to save over the old one) and **Delete**.
- Click something (or select several) and press **Ctrl+C** (Cmd+C) to copy, then **Ctrl+V** (Cmd+V) to paste a copy at the cursor.
- Drop a line end near a circle or text and it attaches: moving the circle or text moves that end. Drag the end away to detach it.
- Drag a circle to move it anywhere.
- Click a circle or text to select it and open its menu. While selected, the scroll wheel or trackpad resizes it instead of the board (text shows its px size). Click the board to deselect.
- The circle menu's **Text** turns the circle into text, ready to type. Enter starts a new line; clicking elsewhere confirms. The text menu changes colour and bold. Above **Bold**, the checklist button starts a line with a checkbox and **1.2.3.** starts a line numbered 1, after the text already there. Pressing Enter on a checklist line starts the next line with a new checkbox, and on a numbered line with the next number (2 after 1, and so on). Pressing Enter on a line that only has the checkbox or number ends the list. Click a checkbox to tick it off; click again to untick it. While typing, highlight some words to change just those: the scroll wheel or trackpad over them makes them bigger or smaller (so one text can have several sizes), **Ctrl+B** makes them bold, and a small bar above the text with a **B** button and colours appears while words are highlighted. **Tab** moves the current line slightly to the right (press again to go further) and **Shift+Tab** moves it back; a checklist or numbered line keeps its indent on the next line. Double-click text to edit it.
- The circle menu's **Square** turns the circle into a square outline. Only the outline can be clicked or dragged, not the space inside. Its menu changes its colour and has **Text**, which adds a label on the outside of its top left corner in the same colour. It resizes like a circle, and when clicked its corners show handles: drag one to stretch it into any rectangle.
- Dragging a circle, square or text near another one snaps its edges or middle in line with the other's, with pink guide lines, so things line up neatly side by side. Lines have their own snapping: dragging a line, an end or a bend lines its ends, bends and timeline marks up with other lines' ends, bends and marks. This also works when moving a group or selection that has squares in it.
- Every menu has a chain icon (**Link**). It will link to other notes, pages or websites later; for now it does nothing.

Built with Next.js, TypeScript, Tailwind CSS and Supabase (login). Deployed on Vercel.

## Setup

### 1. Supabase (login and database)

1. Create a free project at [supabase.com](https://supabase.com).
2. Open **SQL Editor → New query**, paste everything in [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.
3. Open **Project Settings → API** (or the **Connect** button) and copy the **Project URL** and the **anon / publishable key**.

### 2. Run it on your computer (optional)

```bash
npm install
cp .env.example .env.local   # then paste your two Supabase values in
npm run dev
```

Open http://localhost:3000.

### 3. Put it online with Vercel

1. Sign in at [vercel.com](https://vercel.com) with GitHub and import this repo.
2. Add the two environment variables from `.env.example` with your Supabase values.
3. Click **Deploy**.
4. Back in Supabase, open **Authentication → URL Configuration** and set **Site URL** to your Vercel address (for example `https://life-planner.vercel.app`) so confirmation emails link back to the app.

### 4. Make confirmation links work on any device (recommended)

By default the "Confirm your email" link only logs you in if you open it in
the same browser you signed up in. To make it work everywhere (for example,
signing up on a laptop and tapping the link in the Gmail app on your phone):

1. In Supabase open **Authentication → Emails → Templates → Confirm signup**.
2. Replace the link in the message body with:

   ```html
   <a href="{{ .SiteURL }}/auth/callback?token_hash={{ .TokenHash }}&type=email">Confirm your email</a>
   ```

3. Click **Save**.

## How it's organised

| Path | What it does |
| --- | --- |
| `src/app/page.tsx` | Home: every saved board and note |
| `src/app/board/[id]/` | A saved board (saves as you go, keeps presets) |
| `src/app/note/[id]/` | A note and the pages inside it |
| `src/app/actions.ts` | Making a new board, note or page |
| `src/lib/useAutosave.ts` | Saves a page a moment after each change |
| `src/components/Board.tsx` | The white board |
| `src/components/SideMenu.tsx` | The menu opened with v (presets) |
| `src/components/richText.ts` | Text with parts in different sizes, bold and colours |
| `src/components/LineMenu.tsx` | The box beside a clicked line (Time, Angle) |
| `src/components/geometry.ts` | Maths for bent lines and selection boxes |
| `src/components/timeline.ts` | Works out the dates along a timeline |
| `src/app/login/` | Log in and create account |
| `src/middleware.ts` | Keeps you logged in and protects every page |

# Nelson App — Full Project Backup
**Includes:** All primary app pages, components, Firebase config, and documentation.  
**Date:** [add today’s date]

---

## 📁 Included Files

### 1. Core Pages
- `/app/program/page.tsx` — Active session tracking, reps/weights persistence.
- `/app/history/page.tsx` — Session history view with PR logic.
- `/app/dashboard/page.tsx` — Overview and quick actions.
- `/app/login/page.tsx` — Authentication and routing.

### 2. Shared Components
- `/app/components/Toast.tsx` — UI notifications.
- `/app/components/Button.tsx` — Styled reusable button logic.
- `/app/components/Header.tsx` — Navigation and layout consistency.

### 3. Utilities
- `/app/firebase/config.ts` — Firebase initialization.
- `/app/utils/getEmail.ts` — Retrieves user email securely from localStorage/auth.
- `/app/utils/programMeta.ts` — Week/session metadata utilities.

### 4. Documentation
- `Nelson_Project_Snapshot.md` — Full working state snapshot.
- `README_Nelson_App.md` — This handoff guide.

---

## 🧩 Developer Setup Instructions

```bash
npm install
npm run dev
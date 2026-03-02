# Cherrypicker 🍒

Cherrypicker is a web application designed to help users manage their credit card benefits easily and effectively. Built with Next.js, it offers a modern, responsive interface for selecting brands, comparing card benefits, and managing custom data.

## Features

- **Credit Card Management:** Organize and compare the benefits of your credit cards.
- **Brand & Category Management:** Customize your experience by managing your favored brands and their respective categories.
- **Modern UI:** A seamless and interactive interface built with React, Tailwind CSS, and drag-and-drop support (`dnd-kit`).
- **Authentication & Database:** Secure user authentication and data storage powered by Supabase.

## Tech Stack

- **Framework:** [Next.js](https://nextjs.org/) (App Router, Version 16+)
- **Styling:** [Tailwind CSS v4](https://tailwindcss.com/)
- **Icons:** [Lucide React](https://lucide.dev/)
- **State Management:** [Zustand](https://zustand-demo.pmnd.rs/)
- **Database & Auth:** [Supabase](https://supabase.com/)
- **Drag & Drop UI:** [@dnd-kit](https://dndkit.com/)

## Getting Started

### Prerequisites

- Node.js (v18 or higher recommended)
- npm, yarn, pnpm, or bun

### Environment Variables

Create a `.env.local` file in the root directory and add your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=your_supabase_project_url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
```

### Installation

1. Clone the repository:

   ```bash
   git clone <your-repo-url>
   cd cherrypicker
   ```

2. Install the dependencies:

   ```bash
   npm install
   # or
   yarn install
   # or
   pnpm install
   # or
   bun dev
   ```

3. Run the development server:

   ```bash
   npm run dev
   # or
   yarn dev
   # or
   pnpm dev
   # or
   bun dev
   ```

4. Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Learn More

To learn more about the tools used in this project:

- [Next.js Documentation](https://nextjs.org/docs)
- [Supabase Documentation](https://supabase.com/docs)
- [Tailwind CSS Documentation](https://tailwindcss.com/docs)

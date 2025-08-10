module.exports = {
  content: ["projects/web-obs/**/*.{html,ts}"],
  safelist: [
    "grid-cols-[repeat(auto-fill,minmax(45\\%,1fr))]",
    "max-h-[33vh]",
    "aspect-video",
    "!aspect-video",
  ],
  theme: {
    extend: {},
  },
  plugins: [],
};

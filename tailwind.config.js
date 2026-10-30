/** Tailwind cho web app Kiểm kho iSOFH. Build: npx tailwindcss -c tailwind.config.js -i src/input.css -o app.css --minify */
module.exports = {
  content: ['index.html', 'app.js', 'quantri.js', 'huong-dan.html'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter', 'ui-sans-serif', 'system-ui', '-apple-system', 'Segoe UI', 'Roboto', 'Helvetica Neue', 'Arial', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

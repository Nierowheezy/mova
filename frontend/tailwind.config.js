// tailwind.config.js
/** @type {import('tailwindcss').Config} */
module.exports = {
    darkMode: "class",
    content: [
        "./src/**/*.{js,jsx,ts,tsx}", // Adjust this to match your project structure
    ],
    theme: {
        extend: {
            fontFamily: {
                "instrument-sans": ["Instrument Sans", "sans-serif"],
                inter: ["Inter", "sans-serif"],
            },
            colors: {
                brand: {
                    light: "#3AB0FF",
                    DEFAULT: "#0081CF",
                    dark: "#005F99",
                },
                // Or just a flat custom color
                darkGray: "#282A2C",
            },
        },
    },
};

/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      // 自定义颜色 - 温暖精神调色板
      colors: {
        primary: {
          50: '#f0f4ff',
          100: '#e0e9ff',
          200: '#c2d4ff',
          300: '#9ab5ff',
          400: '#6b8eff',
          500: '#4f6df5',
          600: '#3d52d9',
          700: '#3242b0',
          800: '#2b3891',
          900: '#1e2664',
          950: '#131842',
        },
        gold: {
          50: '#fffbeb',
          100: '#fef3c7',
          200: '#fde68a',
          300: '#fcd34d',
          400: '#fbbf24',
          500: '#f59e0b',
          600: '#d97706',
          700: '#b45309',
          800: '#92400e',
          900: '#78350f',
        },
        warm: {
          50: '#fdf8f6',
          100: '#f2e8e5',
          200: '#eaddd7',
          300: '#e0cec7',
          400: '#d2bab0',
          500: '#bfa094',
          600: '#a18072',
          700: '#977669',
          800: '#846358',
          900: '#43302b',
        },
        ink: {
          50: '#f6f7fb',
          100: '#eef0f7',
          200: '#dde1ee',
          300: '#c4cadf',
          400: '#9ba3c4',
          500: '#6b73a0',
          600: '#4a5280',
          700: '#3a4165',
          800: '#2d3350',
          900: '#1f2339',
          950: '#131625',
        },
      },
      // 字体
      // 字体栈全部走本地系统字体，不依赖 Google Fonts（境内不可达会阻塞首屏）
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'PingFang SC', 'Hiragino Sans GB', 'Microsoft YaHei', 'Noto Sans SC', 'system-ui', 'sans-serif'],
        serif: ['Noto Serif SC', 'Songti SC', 'SimSun', 'Georgia', 'serif'],
        display: ['"Playfair Display"', 'Noto Serif SC', 'Songti SC', 'Georgia', 'serif'],
      },
      // 自定义阴影
      boxShadow: {
        'soft': '0 2px 20px -4px rgba(30, 38, 100, 0.08)',
        'card': '0 4px 30px -8px rgba(30, 38, 100, 0.12)',
        'card-hover': '0 20px 50px -10px rgba(30, 38, 100, 0.2)',
        'glow': '0 0 40px rgba(79, 109, 245, 0.3)',
        'glow-primary': '0 0 40px rgba(79, 109, 245, 0.35), 0 0 80px rgba(79, 109, 245, 0.15)',
        'glow-gold': '0 0 36px rgba(245, 158, 11, 0.3), 0 0 72px rgba(245, 158, 11, 0.12)',
        'glow-purple': '0 0 40px rgba(168, 85, 247, 0.3), 0 0 80px rgba(168, 85, 247, 0.12)',
        'gold': '0 0 30px rgba(245, 158, 11, 0.25)',
      },
      // 自定义动画
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'float-slow': 'float 8s ease-in-out infinite',
        'float-orbit': 'floatOrbit 12s ease-in-out infinite',
        'fade-in': 'fadeIn 0.6s ease-out',
        'slide-up': 'slideUp 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
        'gradient': 'gradient 8s ease infinite',
        'gradient-slow': 'gradient 15s ease infinite',
        'pulse-slow': 'pulse 4s cubic-bezier(0.4, 0, 0.6, 1) infinite',
        'shimmer': 'shimmer 2.5s linear infinite',
        'aurora': 'aurora 18s ease infinite',
        'glow-pulse': 'glowPulse 3s ease-in-out infinite',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        floatOrbit: {
          '0%, 100%': { transform: 'translate(0, 0)' },
          '25%': { transform: 'translate(12px, -18px)' },
          '50%': { transform: 'translate(-8px, -28px)' },
          '75%': { transform: 'translate(-16px, -10px)' },
        },
        fadeIn: {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        slideUp: {
          '0%': { opacity: '0', transform: 'translateY(30px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        gradient: {
          '0%, 100%': { backgroundPosition: '0% 50%' },
          '50%': { backgroundPosition: '100% 50%' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-1000px 0' },
          '100%': { backgroundPosition: '1000px 0' },
        },
        aurora: {
          '0%, 100%': { backgroundPosition: '0% 50%', opacity: '0.8' },
          '33%': { backgroundPosition: '50% 100%', opacity: '1' },
          '66%': { backgroundPosition: '100% 50%', opacity: '0.9' },
        },
        glowPulse: {
          '0%, 100%': { opacity: '0.6', transform: 'scale(1)' },
          '50%': { opacity: '1', transform: 'scale(1.05)' },
        },
      },
      // 背景渐变
      backgroundImage: {
        'hero-gradient': 'linear-gradient(135deg, #1e2664 0%, #3d52d9 50%, #4f6df5 100%)',
        'warm-gradient': 'linear-gradient(135deg, #1f2339 0%, #3a4165 100%)',
        'gold-gradient': 'linear-gradient(135deg, #f59e0b 0%, #fbbf24 100%)',
        'aurora-gradient': 'linear-gradient(135deg, rgba(79,109,245,0.35) 0%, rgba(107,142,255,0.25) 25%, rgba(251,191,36,0.2) 50%, rgba(61,82,217,0.3) 75%, rgba(79,109,245,0.35) 100%)',
        'mesh-gradient': 'radial-gradient(at 0% 0%, rgba(79,109,245,0.35) 0%, transparent 50%), radial-gradient(at 100% 0%, rgba(251,191,36,0.25) 0%, transparent 50%), radial-gradient(at 100% 100%, rgba(61,82,217,0.3) 0%, transparent 50%), radial-gradient(at 0% 100%, rgba(107,142,255,0.2) 0%, transparent 50%)',
        'tech-line': 'linear-gradient(90deg, transparent 0%, rgba(79,109,245,0.5) 50%, transparent 100%)',
      },
      // 背景尺寸
      backgroundSize: {
        '300%': '300% 300%',
      },
    },
  },
  plugins: [],
}

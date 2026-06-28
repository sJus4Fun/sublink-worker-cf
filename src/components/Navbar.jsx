/** @jsxRuntime automatic */
/** @jsxImportSource hono/jsx */
import { APP_NAME } from '../constants.js';

export const Navbar = ({ activeView = 'home' } = {}) => {
    const navItems = [
        { key: 'home', href: '/', icon: 'fa-house', label: '首页' },
        { key: 'subscriptions', href: '/?view=subscriptions', icon: 'fa-table-cells-large', label: '我的订阅' }
    ];

    return (
        <nav class="fixed top-0 w-full bg-[#f7f5f0]/95 dark:bg-[#111827]/95 backdrop-blur-md border-b-4 border-[#2c2523] dark:border-[#f7f5f0] z-50 transition-all duration-300">
            <div class="max-w-[1500px] mx-auto px-4">
                <div class="flex items-center justify-between h-16 gap-4">
                    <a href="/" class="flex items-center gap-2 text-base font-bold text-[#2c2523] dark:text-[#f7f5f0] hover:text-[#c21807] dark:hover:text-[#c21807] font-press-start tracking-tighter transition-colors">
                        <img src="/logo.png" alt={`${APP_NAME} logo`} class="w-6 h-6 border-2 border-[#2c2523] dark:border-[#f7f5f0]" />
                        <span class="text-sm sm:text-base">{APP_NAME}</span>
                    </a>
                    <div class="hidden sm:inline-flex items-center border-2 border-[#2c2523] dark:border-[#f7f5f0] bg-white dark:bg-gray-800 p-0.5 shadow-[2px_2px_0_#2c2523] dark:shadow-[2px_2px_0_#f7f5f0]">
                        {navItems.map(item => (
                            <a
                                href={item.href}
                                class={`px-4 py-1.5 text-sm font-semibold flex items-center gap-2 transition-all ${
                                    activeView === item.key 
                                        ? 'bg-[#c21807] text-white' 
                                        : 'text-[#2c2523] dark:text-[#f7f5f0] hover:bg-[#2c2523]/5 dark:hover:bg-white/5'
                                }`}
                            >
                                <i class={`fas ${item.icon} text-xs`}></i>
                                <span class="font-pixel">{item.label}</span>
                            </a>
                        ))}
                    </div>
                    <div class="flex items-center gap-3">
                        <a
                            href={activeView === 'subscriptions' ? '/' : '/?view=subscriptions'}
                            class="sm:hidden w-9 h-9 border-2 border-[#2c2523] dark:border-[#f7f5f0] bg-white dark:bg-gray-800 text-[#2c2523] dark:text-[#f7f5f0] flex items-center justify-center shadow-[2px_2px_0_#2c2523] dark:shadow-[2px_2px_0_#f7f5f0] active:translate-x-0.5 active:translate-y-0.5 active:shadow-none"
                            aria-label={activeView === 'subscriptions' ? '首页' : '我的订阅'}
                        >
                            <i class={`fas ${activeView === 'subscriptions' ? 'fa-house' : 'fa-table-cells-large'} text-sm`}></i>
                        </a>
                        <button
                            class="nes-btn w-9 h-9 flex items-center justify-center bg-white dark:bg-gray-800 text-[#2c2523] dark:text-[#f7f5f0] p-0"
                            x-on:click="toggleDarkMode()"
                            aria-label="Toggle dark mode"
                        >
                            <i class="fas text-sm" x-bind:class="darkMode ? 'fa-sun' : 'fa-moon'"></i>
                        </button>
                        <div id="navbar-auth" class="flex items-center"></div>
                    </div>
                </div>
            </div>
        </nav>
    );
};

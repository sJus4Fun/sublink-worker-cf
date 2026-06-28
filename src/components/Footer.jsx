/** @jsxRuntime automatic */
/** @jsxImportSource hono/jsx */
import { APP_NAME, APP_VERSION } from '../constants.js';

export const Footer = () => {
    const currentYear = new Date().getFullYear();

    return (
        <footer class="mt-12 py-8 border-t-4 border-[#2c2523] dark:border-[#f7f5f0] bg-[#f7f5f0] dark:bg-gray-950 transition-colors font-pixel">
            <div class="max-w-[1500px] mx-auto px-4">
                <div class="flex flex-col md:flex-row items-center justify-between gap-4">
                    <div class="flex flex-col md:flex-row items-center gap-2 md:gap-4 text-[#2c2523] dark:text-[#f7f5f0] text-center md:text-left">
                        <span class="text-xs">© {currentYear} {APP_NAME}. All rights reserved.</span>
                        <span class="hidden md:inline text-[#2c2523] dark:text-[#f7f5f0]">===</span>
                        <span
                            class="text-[10px] px-2 py-0.5 border-2 border-[#2c2523] dark:border-[#f7f5f0] bg-white dark:bg-gray-800 text-[#2c2523] dark:text-[#f7f5f0] font-mono"
                            title={`Version ${APP_VERSION}`}
                        >
                            v{APP_VERSION}
                        </span>
                    </div>
                </div>
            </div>
        </footer>
    );
};

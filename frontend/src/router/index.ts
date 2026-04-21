import { createRouter, createWebHistory } from 'vue-router';
import Home from "@/views/Home.vue";
import Login from "@/views/Login.vue";
import SimpleCreate from "@/views/SimpleCreate.vue";
import TransferFromAvianna from "@/views/TransferFromAvianna.vue";
import ImportFromSite from "@/views/ImportFromSite.vue";


const router = createRouter({
    history: createWebHistory(import.meta.env.BASE_URL),
    routes: [
        {
            path: '/',
            name: 'home',
            component: Home,
            meta: { requiresAuth: true }
        },
        {
            path: '/login',
            name: 'login',
            component: Login
        },
        {
            path: '/simple-create',
            name: 'simple-create',
            component: SimpleCreate,
            meta: { requiresAuth: true }
        },
        {
            path: '/transfer-avianna',
            name: 'transfer-avianna',
            component: TransferFromAvianna,
            meta: { requiresAuth: true }
        },
        {
            path: '/import-site',
            name: 'import-site',
            component: ImportFromSite,
            meta: { requiresAuth: true }
        }
    ]
});

// Navigation guard
router.beforeEach((to, from, next) => {
    const isLoggedIn = localStorage.getItem('isLoggedIn') === 'true';

    if (to.meta.requiresAuth && !isLoggedIn) {
        next('/login');
    } else if (to.path === '/login' && isLoggedIn) {
        next('/');
    } else {
        next();
    }
});

export default router;
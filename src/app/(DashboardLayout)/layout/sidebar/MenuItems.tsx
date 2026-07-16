import {
  IconLayoutDashboard,
  IconStack2,
  IconPlus,
  IconBrain,
  IconChartBar,
  IconKey,
  IconShield,
  IconUsers,
  IconClock,
  IconSpider,
  IconFileText,
} from '@tabler/icons-react';

const Menuitems = [
  {
    navlabel: true,
    subheader: 'APUESTAS',
  },
  {
    id: 'dashboard',
    title: 'Partidos de hoy',
    icon: IconLayoutDashboard,
    href: '/dashboard',
  },
  {
    id: 'suggested-accumulators',
    title: 'Acumuladas sugeridas',
    icon: IconStack2,
    href: '/accumulators/suggested',
  },
  {
    id: 'accumulator-builder',
    title: 'Creador de combinadas',
    icon: IconPlus,
    href: '/accumulators/builder',
  },
  {
    id: 'analyses',
    title: 'Análisis IA',
    icon: IconBrain,
    href: '/analyses',
  },
  {
    id: 'analyses-performance',
    title: 'Rendimiento / aciertos',
    icon: IconChartBar,
    href: '/analyses/performance',
  },
  {
    navlabel: true,
    subheader: 'CUENTA',
  },
  {
    id: 'api-keys',
    title: 'API Keys',
    icon: IconKey,
    href: '/settings/api-keys',
  },
  {
    navlabel: true,
    subheader: 'ADMIN',
  },
  {
    id: 'admin-users',
    title: 'Usuarios',
    icon: IconUsers,
    href: '/admin/users',
  },
  {
    id: 'admin-sessions',
    title: 'Sesiones',
    icon: IconClock,
    href: '/admin/sessions',
  },
  {
    id: 'admin-scrapers',
    title: 'Scrapers',
    icon: IconSpider,
    href: '/admin/scrapers',
  },
  {
    id: 'admin-logs',
    title: 'Logs',
    icon: IconFileText,
    href: '/admin/logs',
  },
  {
    id: 'admin-panel',
    title: 'Panel Admin',
    icon: IconShield,
    href: '/admin',
  },
];

export default Menuitems;

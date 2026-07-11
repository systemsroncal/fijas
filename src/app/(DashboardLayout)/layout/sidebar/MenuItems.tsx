import {
  IconLayoutDashboard,
  IconStack2,
  IconPlus,
  IconBrain,
  IconKey,
  IconShield,
  IconUsers,
  IconClock,
  IconSpider,
  IconFileText,
} from '@tabler/icons-react';
import { uniqueId } from 'lodash';

const Menuitems = [
  {
    navlabel: true,
    subheader: 'APUESTAS',
  },
  {
    id: uniqueId(),
    title: 'Partidos de hoy',
    icon: IconLayoutDashboard,
    href: '/dashboard',
  },
  {
    id: uniqueId(),
    title: 'Acumuladas sugeridas',
    icon: IconStack2,
    href: '/accumulators/suggested',
  },
  {
    id: uniqueId(),
    title: 'Creador de combinadas',
    icon: IconPlus,
    href: '/accumulators/builder',
  },
  {
    id: uniqueId(),
    title: 'Análisis IA',
    icon: IconBrain,
    href: '/analyses',
  },
  {
    navlabel: true,
    subheader: 'CUENTA',
  },
  {
    id: uniqueId(),
    title: 'API Keys',
    icon: IconKey,
    href: '/settings/api-keys',
  },
  {
    navlabel: true,
    subheader: 'ADMIN',
  },
  {
    id: uniqueId(),
    title: 'Usuarios',
    icon: IconUsers,
    href: '/admin/users',
  },
  {
    id: uniqueId(),
    title: 'Sesiones',
    icon: IconClock,
    href: '/admin/sessions',
  },
  {
    id: uniqueId(),
    title: 'Scrapers',
    icon: IconSpider,
    href: '/admin/scrapers',
  },
  {
    id: uniqueId(),
    title: 'Logs',
    icon: IconFileText,
    href: '/admin/logs',
  },
  {
    id: uniqueId(),
    title: 'Panel Admin',
    icon: IconShield,
    href: '/admin',
  },
];

export default Menuitems;

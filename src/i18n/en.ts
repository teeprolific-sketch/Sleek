/** English (source) strings. Keys are grouped by area. */
export const en = {
  // tabs
  'tab.home': 'Home',
  'tab.jobs': 'My Jobs',
  'tab.services': 'Services',
  'tab.chats': 'Chats',
  'tab.profile': 'Profile',
  'tab.dashboard': 'Dashboard',
  'tab.artisanJobs': 'Jobs',
  'tab.schedule': 'Schedule',
  'tab.earnings': 'Earnings',

  // common
  'common.cancel': 'Cancel',
  'common.save': 'Save',
  'common.retry': 'Try again',
  'common.seeAll': 'See all',
  'common.done': 'Done',
  'common.gotIt': 'Got it',
  'common.from': 'From',
  'common.km': '{km} km away',

  // home
  'home.morning': 'Good morning,',
  'home.afternoon': 'Good afternoon,',
  'home.evening': 'Good evening,',
  'home.searchPlaceholder': 'What do you need done?',
  'home.ugentTitle': 'Ask Ugent to book for you',
  'home.ugentBody': '“Find a mechanic in Yaba tomorrow morning.” You confirm every step.',
  'home.attention': 'Needs your attention',
  'home.allJobs': 'All jobs',
  'home.popular': 'Popular services',
  'home.topAvailable': 'Top available in {city}',
  'home.rankedNote': 'Ranked by verification, completed jobs, ratings and reliability. Only artisans available right now are shown.',
  'home.escrowTitle': 'Pay safely with Sleek Hold',
  'home.escrowBody': 'Your money is held by Sleek and released only after you approve the work.',
  'home.howItWorks': 'How it works',
  'home.saved': 'Your saved artisans',
  'home.quick.favourites': 'Saved',
  'home.quick.history': 'History',
  'home.quick.disputes': 'Disputes',
  'home.quick.refer': 'Refer & earn',

  // job status
  'status.requested': 'Negotiating',
  'status.price_agreed': 'Awaiting Payment',
  'status.funded': 'Upcoming',
  'status.in_progress': 'On Job',
  'status.proof_submitted': 'Pending Approval',
  'status.completed': 'Completed',
  'status.disputed': 'In Dispute',
  'status.resolved': 'Resolved',
  'status.cancelled': 'Cancelled',
  'status.declined': 'Declined',

  // timeline
  'timeline.title': 'Job timeline',
  'timeline.requested': 'Requested',
  'timeline.price_agreed': 'Price agreed',
  'timeline.booked': 'Booked · paid into Sleek Hold',
  'timeline.en_route': 'Artisan en route',
  'timeline.started': 'Work started',
  'timeline.proof': 'Proof submitted',
  'timeline.approved': 'Approved',
  'timeline.paid': 'Paid',
  'timeline.sameForBoth': 'You and the {other} see exactly the same timeline.',
  'timeline.waiting': 'Waiting',

  // escrow
  'escrow.protected': 'Sleek Hold Protected',
  'escrow.protectedHeld': 'Sleek Hold Protected · {amount} held',
  'escrow.notFunded': 'Not yet in Sleek Hold',
  'escrow.autoRelease': 'Auto-release in {time}',
  'escrow.autoReleaseSoon': 'Payment releases automatically in {time} unless you approve or dispute.',

  // chat
  'chat.placeholder': 'Type a message',
  'chat.blocked': 'Message blocked',
  'chat.looksLikeContact': 'This message looks like it contains contact details or an off-app request. It won’t be sent.',
  'chat.queued': 'Waiting for network — will send automatically',
  'chat.rules': 'Read the chat rules',

  // disputes
  'dispute.centre': 'Dispute Centre',
  'dispute.intro': 'Something not right? We’ll look at it fairly. Your money stays safely in Sleek Hold while Sleek reviews the chat, the agreed price and all photos.',
  'dispute.open': 'Open a dispute',
  'dispute.active': 'Active',
  'dispute.closed': 'Closed',
  'dispute.none': 'No disputes',
  'dispute.noneBody': 'That’s good news. If something ever goes wrong on a funded job, you can raise it here.',
  'dispute.howItWorks': 'How disputes work',
  'dispute.step1': 'You explain what happened and add photos',
  'dispute.step2': 'The other side adds their response',
  'dispute.step3': 'A Sleek reviewer checks chat history and proof of work',
  'dispute.step4': 'Sleek decides: release, refund, or split — usually within 1–3 working days',

  // safety
  'safety.button': 'Safety',
  'safety.title': 'Safety options',
  'safety.sos': 'Alert Sleek Safety now',
  'safety.sosBody': 'A safety agent is notified immediately and follows up in the app.',
  'safety.unsafe': 'I feel unsafe',
  'safety.call112': 'Call emergency services (112)',
  'safety.share': 'Share job details with my trusted contact',
  'safety.sent': 'Sleek Safety has been alerted. If you are in immediate danger, call 112.',

  // empty states
  'empty.favourites': 'No saved artisans yet',
  'empty.favouritesBody': 'Tap the heart on an artisan’s profile to save them for next time.',
  'empty.history': 'No jobs here yet',
  'empty.historyBody': 'Finished, cancelled and disputed jobs show up here.',
  'empty.notifications': 'You’re all caught up',

  // network
  'net.offline': 'You’re offline',
  'net.offlineBody': 'Showing saved info. Messages will send when you’re back online. Payments are paused.',
  'net.weak': 'Weak network — things may load slowly',
  'net.back': 'Back online',

  // errors
  'error.title': 'Something went wrong',
  'error.body': 'This screen hit a problem. Your money and jobs are safe — nothing was lost.',
  'error.goHome': 'Go to home',
  'notFound.title': 'Page not found',
  'notFound.body': 'This link may be old or mistyped.',

  // settings
  'settings.language': 'Language',
  'settings.comingSoon': 'Coming soon',
  'settings.notifications': 'Notification settings',
};

export type Dict = typeof en;

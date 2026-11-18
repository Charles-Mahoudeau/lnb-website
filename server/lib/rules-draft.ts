import type { RuleIcon } from '#shared/schemas/rules';

// The draft rules an admin can load into an empty list (docs/rules.md). They are a starting point
// to edit, never shown until the admin saves them and the page is open.

interface Text {
  en: string;
  fr: string;
}

export interface DraftCategory {
  icon: RuleIcon;
  name: Text;
  rules: { title: Text; text: Text }[];
}

const t = (en: string, fr: string): Text => ({ en, fr });

export const DRAFT_RULES: DraftCategory[] = [
  {
    icon: 'heart-handshake',
    name: t('Respect', 'Respect'),
    rules: [
      {
        title: t('Treat everyone with respect', 'Respectez tout le monde'),
        text: t(
          'In chat and in voice. Insults, harassment, discrimination and threats are not allowed.',
          'Au chat comme en vocal. Les insultes, le harcèlement, les discriminations et les menaces ne sont pas acceptés.',
        ),
      },
      {
        title: t('No spam or advertising', 'Pas de spam ni de publicité'),
        text: t(
          'Do not flood the chat, and do not advertise servers, products or other communities.',
          'N’inondez pas le chat et ne faites pas la promotion de serveurs, de produits ou d’autres communautés.',
        ),
      },
      {
        title: t('Follow the moderators', 'Suivez les modérateurs'),
        text: t(
          'Moderators decide case by case. If you disagree, say so afterwards in a private message to them, not in public chat.',
          'Les modérateurs décident au cas par cas. Si vous n’êtes pas d’accord, dites-le ensuite par message privé, pas dans le chat public.',
        ),
      },
    ],
  },
  {
    icon: 'shield-check',
    name: t('Cheating and mods', 'Triche et mods'),
    rules: [
      {
        title: t('Play with the Modlist only', 'Jouez avec la Modlist uniquement'),
        text: t(
          'Use the official instance. Mods or files that are not on the Modlist are not allowed.',
          'Utilisez l’instance officielle. Les mods ou fichiers absents de la Modlist ne sont pas autorisés.',
        ),
      },
      {
        title: t('No cheating', 'Pas de triche'),
        text: t(
          'No x-ray, fly, auto-clickers, hacked clients or anything else that gives you an unfair edge.',
          'Pas de x-ray, de fly, d’auto-clicker, de client modifié ni rien d’autre qui vous donne un avantage injuste.',
        ),
      },
      {
        title: t('Report bugs, do not use them', 'Signalez les bugs, ne les exploitez pas'),
        text: t(
          'If you find a duplication or another bug, tell a moderator. Using it is cheating.',
          'Si vous trouvez une duplication ou un autre bug, prévenez un modérateur. L’exploiter, c’est tricher.',
        ),
      },
    ],
  },
  {
    icon: 'box',
    name: t('Builds and griefing', 'Constructions et grief'),
    rules: [
      {
        title: t(
          'Do not damage other players’ builds',
          'Ne dégradez pas les constructions des autres',
        ),
        text: t(
          'Do not break, change or burn what others built without their agreement.',
          'Ne cassez pas, ne modifiez pas et ne brûlez pas ce que d’autres ont construit sans leur accord.',
        ),
      },
      {
        title: t('No stealing', 'Pas de vol'),
        text: t(
          'Do not take items from chests, farms or players unless you were told you can.',
          'Ne prenez pas d’objets dans les coffres, les fermes ou sur les joueurs sans y être autorisé.',
        ),
      },
      {
        title: t('Do not build lag machines', 'Pas de machines à lag'),
        text: t(
          'Huge redstone clocks, entity farms and similar builds that slow the server for everyone are not allowed.',
          'Les horloges redstone géantes, fermes d’entités et autres constructions qui ralentissent le serveur pour tous sont interdites.',
        ),
      },
    ],
  },
  {
    icon: 'user-round',
    name: t('Accounts and Warden', 'Comptes et Warden'),
    rules: [
      {
        title: t('One person, your own accounts', 'Une personne, vos propres comptes'),
        text: t(
          'Only link Minecraft accounts that are yours. Do not play on someone else’s.',
          'Ne liez que des comptes Minecraft qui sont à vous. Ne jouez pas sur celui de quelqu’un d’autre.',
        ),
      },
      {
        title: t('Do not share your device', 'Ne partagez pas votre appareil'),
        text: t(
          'Your linked device is you. Do not lend it, and revoke it from your account if you lose it.',
          'Votre appareil lié, c’est vous. Ne le prêtez pas et révoquez-le depuis votre compte si vous le perdez.',
        ),
      },
      {
        title: t('No ban evasion', 'Pas de contournement de ban'),
        text: t(
          'Do not come back with another account while you are banned.',
          'Ne revenez pas avec un autre compte pendant un bannissement.',
        ),
      },
    ],
  },
  {
    icon: 'calendar',
    name: t('Events and tournaments', 'Événements et tournois'),
    rules: [
      {
        title: t('Follow the organizers', 'Suivez les organisateurs'),
        text: t(
          'During an event, the organizers’ instructions come first.',
          'Pendant un événement, les consignes des organisateurs passent en premier.',
        ),
      },
      {
        title: t('Play fair in tournaments', 'Jouez fair-play en tournoi'),
        text: t(
          'No teaming with opponents, no outside help, no exploiting the format.',
          'Pas d’entente avec les adversaires, pas d’aide extérieure, pas d’exploitation du format.',
        ),
      },
    ],
  },
];

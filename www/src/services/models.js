/**
 * Data models used across the app. These are JSDoc types so the codebase stays
 * lightweight while still documenting architecture intentionally.
 */

/**
 * @typedef {'sale'|'no_sale'} EntryType
 */

/**
 * @typedef {'child'|'adult'} CustomerType
 */

/**
 * @typedef {Object} BusinessSettings
 * @property {string} businessName
 * @property {string} valueProp
 * @property {string} currency
 * @property {number[]} operatingDays
 * @property {number} loyaltyThreshold
 * @property {string} googleClientId
 * @property {{connected:boolean,email:string,connectedAt:string}} googleConnection
 * @property {{posthogKey:string,posthogHost:string,sentryDsn:string}} observability
 * @property {{provider:'none'|'groq'|'openrouter',apiKey:string,model:string,baseUrl:string}} assistant
 */

/**
 * @typedef {Object} Product
 * @property {string} id
 * @property {string} name
 * @property {number} price
 * @property {number} stock
 */

/**
 * @typedef {Object} Wallet
 * @property {string} id
 * @property {string} label
 * @property {number} balance
 * @property {string[]} memberIds
 */

/**
 * @typedef {Object} Customer
 * @property {string} id
 * @property {CustomerType} type
 * @property {string} name
 * @property {string} guardianName
 * @property {string} grade
 * @property {string} phone
 * @property {string} qrId
 * @property {string} walletId
 */

/**
 * @typedef {Object} Entry
 * @property {string} id
 * @property {EntryType} type
 * @property {string} date
 * @property {number} amount
 * @property {string} reasonKey
 * @property {string} reasonText
 * @property {string} notes
 * @property {string} payment
 * @property {number} qty
 * @property {string} customerId
 * @property {string} productId
 * @property {number} walletUsed
 * @property {number} cashPaid
 * @property {string} createdAt
 * @property {string} updatedAt
 */

/**
 * @typedef {Object} ActivityItem
 * @property {string} id
 * @property {string} type
 * @property {string} message
 * @property {string} at
 */

/**
 * @typedef {Object} AppState
 * @property {number} version
 * @property {string} lastSavedAt
 * @property {BusinessSettings} settings
 * @property {Product[]} products
 * @property {Customer[]} customers
 * @property {Wallet[]} wallets
 * @property {Entry[]} entries
 * @property {ActivityItem[]} activity
 */

export const NO_SALE_REASON_OPTIONS = [
  'weather',
  'stock_shortage',
  'transport_issue',
  'personal_reason',
  'equipment_issue',
  'holiday',
  'other'
];

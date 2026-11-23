// The deadline logic for `loadSettled` lives in packages/shared so web and the Expo app share one tested copy.
export { awaitLoadSettled } from '../../packages/shared/src/load-settled'

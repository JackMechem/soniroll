import { Redirect } from 'expo-router';

/** Recordings are in the Library's Files tab now (its Recordings filter), as on the website; old
    links to the Recordings tab land there. A recording's own page (`[id].tsx`) is unchanged. */
export default function RecordingsRedirect() {
  return <Redirect href={{ pathname: '/files', params: { filter: 'source:recording' } }} />;
}

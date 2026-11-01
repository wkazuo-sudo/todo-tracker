import { personName, searchAll, type Data } from "./logic";

type Props = {
  data: Data;
  query: string;
  onPerson: (personId: string, meetingId?: string) => void;
};

export function SearchResults({ data, query, onPerson }: Props) {
  const hits = searchAll(data, query);
  const empty = hits.people.length + hits.meetings.length + hits.tasks.length === 0;

  return (
    <>
      <h1 className="page-title">Search</h1>
      <p className="page-sub">Results for “{query.trim()}”.</p>
      {empty && <p className="empty">Nothing matches “{query.trim()}”.</p>}

      {hits.people.length > 0 && (
        <section className="search-group">
          <h2>People</h2>
          {hits.people.map((person) => (
            <button key={person.id} className="person-row" onClick={() => onPerson(person.id)}>
              <span className="person-name">{person.name}</span>
            </button>
          ))}
        </section>
      )}

      {hits.meetings.length > 0 && (
        <section className="search-group">
          <h2>Meetings</h2>
          {hits.meetings.map((meeting) => (
            <button
              key={meeting.id}
              className="person-row"
              onClick={() => onPerson(meeting.personId, meeting.id)}
            >
              <span className="person-name">{meeting.title}</span>
              <span className="person-meta">{personName(data.people, meeting.personId)}</span>
            </button>
          ))}
        </section>
      )}

      {hits.tasks.length > 0 && (
        <section className="search-group">
          <h2>Tasks</h2>
          {hits.tasks.map((task) => {
            const meeting = data.meetings.find((item) => item.id === task.meetingId);
            return (
              <button
                key={task.id}
                className="person-row"
                onClick={() => meeting && onPerson(meeting.personId, meeting.id)}
              >
                <span className="person-name">{task.title}</span>
                <span className="person-meta">
                  {personName(data.people, task.requesterId)}
                  {meeting ? ` · ${meeting.title}` : ""}
                </span>
              </button>
            );
          })}
        </section>
      )}
    </>
  );
}

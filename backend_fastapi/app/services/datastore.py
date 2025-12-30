



class DatastoreService:
    def __init__(self):
        self.datastore = Datastore()

    def create_datastore(self, datastore_name: str) -> Datastore:
        return self.datastore.create(datastore_name)

    def get_datastore(self, datastore_id: UUID) -> Datastore:
        return self.datastore.get_datastore(datastore_id)

    def update_datastore(self, datastore_id: UUID) -> Datastore:
        return self.datastore.update_datastore(datastore)

    def refresh_datastore(self, datastore_id: UUID) -> Datastore:
        return self.datastore.refresh_datastore(datastore_id)

    def delete_datastore(self, datastore_id: UUID) -> Datastore:
        return self.datastore.delete_datastore(datastore_id)

    def describe_datastore(self, datastore_id: UUID) -> str:
        return self.datastore.describe_datastore(datastore_id)

    def list_datastores(self) -> List[Datastore]:
        return self.datastore.list()

    def add_record(self, datastore_id: UUID, record: Record) -> Datastore:
        return self.datastore.add_record(datastore, record)

    def update_record(self, datastore_id: UUID, record: Record) -> Datastore:
        return self.datastore.update_record(datastore_iddatastore, record)

    def delete_record(self, datastore_id: UUID, record: Record) -> Datastore:
        return self.datastore.delete_record(datastore, record)


import { Injectable } from '@nestjs/common';
import { CreateImageDto } from './dto/create-image.dto';
import { BlobServiceClient } from '@azure/storage-blob';

@Injectable()
export class ImagesService {
  private blobServiceClient = BlobServiceClient.fromConnectionString(
    process.env.AZURE_CONNECTION_STRING,
  );
  private containerClient = this.blobServiceClient.getContainerClient(
    process.env.AZURE_CONTAINER_NAME,
  );

  create(createImageDto: CreateImageDto) {
    console.log(createImageDto);
    //ADD DUMMY IMAGE CREATION LOGIC AND UPLOAD TO AZURE BLOB

    return 'This action adds a new image';
  }
}

from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('schoolSettings', '0007_landingsection_banner_image'),
    ]

    operations = [
        migrations.CreateModel(
            name='LandingCarouselImage',
            fields=[
                ('id', models.BigAutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('image', models.URLField(max_length=500)),
                ('title', models.CharField(blank=True, max_length=200)),
                ('caption', models.CharField(blank=True, max_length=300)),
                ('display_order', models.PositiveIntegerField(default=0)),
                ('landing_page', models.ForeignKey(
                    on_delete=django.db.models.deletion.CASCADE,
                    related_name='carousel_images',
                    to='schoolSettings.tenantlandingpage',
                )),
            ],
            options={
                'ordering': ['display_order'],
            },
        ),
    ]
